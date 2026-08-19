import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Concept DOI record for the Hotspots dataset — resolving via "versions/latest"
// means future Zenodo versions are picked up automatically on the nightly rebuild.
const ZENODO_CONCEPT_RECORD = "21383990";
const ZENODO_LATEST_URL = `https://zenodo.org/api/records/${ZENODO_CONCEPT_RECORD}/versions/latest`;

const OUT_DIR = new URL("../public/stac/files/", import.meta.url).pathname;
const TMP_DIR = join(tmpdir(), `zenodo-fetch-${Date.now()}`);

// Only these rasters are wired into the map — other files in the record (e.g.
// metadata.json) are provenance/documentation and aren't fetched here.
const WANTED_FILES = new Set([
  "allspeciesstats_birdsfinal.tiff",
  "ansvarsarterstats_birdsfinal.tiff",
  "bias_birdsfinal.tiff",
]);

function humanSize(bytes) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  return resp.json();
}

async function downloadFile(url, destPath) {
  const resp = await fetch(url);
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

  rmSync(TMP_DIR, { recursive: true, force: true });
  console.log(`Done. Wrote ${files.length} reprojected raster(s) to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("fetch-zenodo-data failed:", err.message);
  process.exit(1);
});
