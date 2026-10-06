import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Concept DOI record for the Hotspots dataset — resolving via "versions/latest"
// means future Zenodo versions are picked up automatically on the nightly rebuild.
const ZENODO_CONCEPT_RECORD = "21383990";
const ZENODO_LATEST_URL = `https://zenodo.org/api/records/${ZENODO_CONCEPT_RECORD}/versions/latest`;

const OUT_DIR = new URL("../public/stac/files/", import.meta.url).pathname;
// The record's metadata.json feeds the Data tab on the kart page (imported at
// build time), so it's kept in step with the rasters on every fetch.
const METADATA_OUT = new URL("../src/data/hotspot-metadata.json", import.meta.url).pathname;
// Which record was fetched, plus links to its data provenance report (a PDF
// in the record), for the kart page's Data tab.
const RECORD_OUT = new URL("../src/data/zenodo-record.json", import.meta.url).pathname;
const REPORT_PATTERN = /^pipelineDataReport.*\.pdf$/i;
const TMP_DIR = join(tmpdir(), `zenodo-fetch-${Date.now()}`);

// Only these rasters are wired into the map; metadata.json is fetched
// separately below, and other files (e.g. the provenance report) aren't fetched. As of
// v1.0.1 each file is a single multi-band COG covering all taxa (bands named
// "{taxa}_richness" / "{taxa}_uncertainty" / "{taxa}_bias"), not one file per
// taxon/metric — see collections/hotspot-species/items/*.json for the band
// indices the map reads from each file. One file per species group: all
// species, species of national responsibility (ansvarsarter), and threatened
// (Red List) species — the last added in the 2026-10-06 version.
const WANTED_FILES = new Set([
  "allSpeciesUploadRaster.tiff",
  "ansvarsArterUploadRaster.tiff",
  "threatenedSpeciesUploadRaster.tiff",
]);

// Zenodo answers 403 to requests without an identifying User-Agent (Node's
// fetch sends none by default).
const FETCH_HEADERS = {
  "User-Agent": "hotspots-website-fetch (+https://github.com/gjearevoll/hotspots-website)",
};

function humanSize(bytes) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function fetchJson(url) {
  const resp = await fetch(url, { headers: FETCH_HEADERS });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  return resp.json();
}

async function downloadFile(url, destPath) {
  const resp = await fetch(url, { headers: FETCH_HEADERS });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(destPath, buf);
  return buf.length;
}

async function main() {
  console.log(`Resolving latest Zenodo version for concept record ${ZENODO_CONCEPT_RECORD}...`);
  const record = await fetchJson(ZENODO_LATEST_URL);
  console.log(`Using record ${record.id} (${record.metadata?.title ?? "untitled"}, published ${record.metadata?.publication_date ?? "?"})`);

  const files = (record.files ?? []).filter((f) => WANTED_FILES.has(f.key));
  if (files.length !== WANTED_FILES.size) {
    const found = new Set(files.map((f) => f.key));
    const missing = [...WANTED_FILES].filter((k) => !found.has(k));
    throw new Error(`Zenodo record ${record.id} is missing expected file(s): ${missing.join(", ")}`);
  }

  mkdirSync(TMP_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  for (const file of files) {
    const srcPath = join(TMP_DIR, file.key);
    console.log(`Downloading ${file.key} (${humanSize(file.size)})...`);
    await downloadFile(file.links.self, srcPath);

    const outName = file.key.replace(/\.tiff?$/i, ".tif");
    const outPath = join(OUT_DIR, outName);
    console.log(`Reprojecting ${file.key} -> EPSG:4326 COG (${outName})...`);
    execFileSync(
      "gdalwarp",
      [
        "-t_srs", "EPSG:4326",
        "-r", "bilinear",
        "-of", "COG",
        "-co", "COMPRESS=LZW",
        "-dstnodata", "nan",
        "-overwrite",
        srcPath,
        outPath,
      ],
      { stdio: "inherit" }
    );
  }

  const metaFile = (record.files ?? []).find((f) => f.key === "metadata.json");
  if (!metaFile) throw new Error(`Zenodo record ${record.id} has no metadata.json`);
  console.log("Downloading metadata.json...");
  await downloadFile(metaFile.links.self, METADATA_OUT);

  const reportFile = (record.files ?? []).find((f) => REPORT_PATTERN.test(f.key));
  if (!reportFile) console.warn(`No data provenance report found in record ${record.id}`);
  const recordInfo = {
    recordId: record.id,
    doi: record.doi,
    report: reportFile
      ? {
          file: reportFile.key,
          sizeBytes: reportFile.size,
          viewUrl: `https://zenodo.org/records/${record.id}/preview/${encodeURIComponent(reportFile.key)}`,
          downloadUrl: `https://zenodo.org/records/${record.id}/files/${encodeURIComponent(reportFile.key)}?download=1`,
        }
      : null,
  };
  writeFileSync(RECORD_OUT, JSON.stringify(recordInfo, null, 2) + "\n");

  rmSync(TMP_DIR, { recursive: true, force: true });
  console.log(`Done. Wrote ${files.length} reprojected raster(s) to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("fetch-zenodo-data failed:", err.message);
  process.exit(1);
});
