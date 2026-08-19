# Hotspots — project website

Static website for the [Hotspots project](https://nva.sikt.no/projects/2769822) at the Gjærevoll Centre, NTNU. Built with [Astro](https://astro.build) and hosted on GitHub Pages.

**Live site:** https://gjearevoll.github.io/hotspots-website/

---

## How it works

The site is fully static HTML. All data — publications, project description, funders, and core team — is fetched from the [NVA API](https://api.nva.unit.no) at **build time**. There is no server-side rendering and no API calls from the browser. The result is a fast, cacheable static site.

A GitHub Actions workflow rebuilds the site automatically every night at 03:00 UTC, so the publication list stays current without any manual work.

---

## Architecture

```
src/config/project.yaml     ← single source of truth for all project config
src/lib/
  config.ts                 ← loads and exports project.yaml (build-time only)
  nva.ts                    ← all NVA/Cristin API functions
src/data/
  hero-images.yaml          ← species images for the hero carousel
  repositories.yaml         ← GitHub repos shown on the Codebase page
  tools.yaml                ← interactive maps shown on the Maps page
src/components/
  HeroCarousel.astro        ← image carousel on the front page
  LanguageSwitcher.astro    ← NO | EN toggle in the header
  PublicationList.astro     ← reusable publication list
  TeamGrid.astro            ← core team cards + contributors grid
  RepoCard.astro            ← individual GitHub repo card
  ToolCard.astro            ← individual map card with iframe
src/pages/
  no/                       ← Norwegian pages (Nynorsk)
  en/                       ← English pages
public/
  images/species/           ← hero images
  kart/                     ← standalone Leaflet map HTML files
```

### What is automatic vs manual

| Content | How it's updated |
|---|---|
| Publications | Automatic — fetched from NVA every build |
| Project description | Automatic — fetched from NVA (popularScientificSummary) |
| Funders | Automatic — fetched from NVA funding field |
| Core team | Automatic — fetched from NVA project contributors + Cristin ORCID |
| Co-authors | Automatic — extracted from NVA publication records |
| Hero images | Manual — add file + line in `hero-images.yaml` |
| Maps | Manual — add HTML file + line in `tools.yaml` |
| Repos | Manual — edit `repositories.yaml` |
| Project config | Manual — edit `project.yaml` |

---

## Data browser — map explorer (🚧 under construction)

> **Status:** Architecture decided, implementation in progress.
> This section describes the intended solution. Not all parts are built yet.

The **Utforsk / Explore** tab will let visitors browse and download biodiversity
raster maps produced by the Hotspot project, rendered interactively in the browser
without requiring any GIS software.

### How it will work

```
Zenodo (file storage + DOI)
  └── GeoTIFF files (Cloud Optimized)
        ↑ read at build time via Zenodo REST API
STAC catalog (JSON files in public/stac/)
  └── describes all available map layers
        ↑ read at runtime by the Explore page
Astro page — src/pages/[no|en]/kart.astro
  └── Leaflet map + layer list, reads STAC catalog at page load
        ↓ COG tiles streamed directly from Zenodo to the browser
Download button → redirects to Zenodo file URL (no data duplication)
```

All map files live on Zenodo. The website holds only JSON catalog files and
the Leaflet-based viewer. No map data passes through GitHub.

### Storage architecture on Zenodo

One Zenodo Community collects all Hotspot datasets. Within it, records are
organised by product type, not by date — each record is versioned over time:

```
Zenodo Community: hotspot-project (gjearevollsenteret)
  ├── Record: Artsrikhet Norge          ← versioned, updated ~quarterly
  ├── Record: Hotspot-indeks Norge      ← versioned, updated ~quarterly
  ├── Record: Prøvetakingsinnsats Norge ← versioned, updated ~quarterly
  ├── Record: Fugler enkeltarter        ← updated rarely
  ├── Record: Karplanter enkeltarter    ← updated rarely
  └── ...
```

Each record has:
- A **concept DOI** (permanent, always points to latest version) — cite this in papers
- A **version DOI** (permanent, points to a specific version) — cite this for reproducibility

### STAC catalog

The catalog lives in `public/stac/` and is a set of plain JSON files following the
[STAC 1.0.0 standard](https://stacspec.org/). It is generated automatically at
build time from Zenodo metadata and GeoTIFF headers.

```
public/stac/
  catalog.json
  collections/
    artsrikhet/
      collection.json
      items/
        artsrikhet_norge_500m_2025-Q2.json
        ...
    hotspot/
      ...
```

### Metadata convention

Spatial metadata (bounding box, resolution, projection) is read automatically
from the GeoTIFF file headers using `rasterio`. No manual entry needed.

All other domain-specific metadata is encoded as structured `key:value` keywords
on the Zenodo record. This allows the build script to parse them without any
custom API or schema.

**Required keywords on every Zenodo record:**

| Keyword | Allowed values | Example |
|---|---|---|
| `artsgruppe:` | `fugler`, `karplanter`, `insekter`, `alle` | `artsgruppe:fugler` |
| `produkt:` | `artsrikhet`, `hotspot`, `prøvetaking`, `enkeltart` | `produkt:artsrikhet` |
| `område:` | `norge`, `vestland`, `svalbard`, … | `område:norge` |
| `sesong:` | `ÅÅÅÅ-Q1` … `ÅÅÅÅ-Q4` | `sesong:2025-Q2` |

Standard Zenodo fields (title, description, creators, version, license) are used
as-is and mapped directly into the STAC catalog and the website UI.

**Example of a correctly tagged Zenodo record:**

```
Title:       Artsrikhet Norge 500m — Hotspot-prosjektet
Description: Antall arter per 500×500 m gridcelle for Norge, basert på ...
Version:     2025-Q2
License:     CC BY 4.0
Keywords:    artsgruppe:alle, produkt:artsrikhet, område:norge, sesong:2025-Q2
```

### Workflow — uploading a new map version

When a new map version is ready:

1. Convert the GeoTIFF to Cloud Optimized GeoTIFF (COG) locally:
   ```bash
   rio cogeo create input.tif output_cog.tif --overview-level 6
   rio cogeo validate output_cog.tif
   ```
2. Upload to the correct Zenodo record as a new version
3. Fill in the standard metadata fields (title, description, creators, version)
4. Add the required `key:value` keywords (see table above)
5. Publish — the nightly GitHub Actions build will pick up the new version
   automatically, or trigger a manual build from the GitHub Actions tab

No changes to the website repository are needed.

### What is automatic vs manual (data browser)

| Task | How |
|---|---|
| Detect new Zenodo records/versions | Automatic — nightly build queries Zenodo API |
| Read spatial metadata (bbox, resolution, CRS) | Automatic — rasterio reads GeoTIFF header |
| Read descriptive metadata (title, description) | Automatic — Zenodo API |
| Read domain metadata (artsgruppe, produkt, …) | Automatic — parsed from Zenodo keywords |
| Generate STAC catalog JSON | Automatic — build-time script |
| Upload new map files to Zenodo | Manual — researcher uploads via zenodo.org |
| Tag Zenodo record with correct keywords | Manual — follow the keyword table above |

### File format requirements

All map files stored on Zenodo must be **Cloud Optimized GeoTIFF (COG)**.
COG files have an internal tile structure that allows the browser to fetch only
the portion of the file it needs, without downloading the full file.

Convert using [rio-cogeo](https://cogeotiff.github.io/rio-cogeo/):

```bash
pip install rio-cogeo
rio cogeo create input.tif output.tif --overview-level 6
```

---

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:4321/hotspot_website/no/ in your browser.

The dev server watches for file changes and hot-reloads automatically. Press `Ctrl+C` to stop.

To do a full production build:

```bash
npm run build
npm run preview   # serves the built site locally
```

---

## Deploying

Push to `main` — GitHub Actions builds and deploys to GitHub Pages automatically. The workflow is defined in `.github/workflows/deploy.yml`.

You can also trigger a manual build from the GitHub Actions tab using "Run workflow".

---

## Updating content

### Publications
No action needed. The build fetches all publications linked to the project in NVA automatically. The nightly rebuild ensures the list stays current.

### Hero images
1. Add the image file to `public/images/species/`
2. Add a matching entry to `src/data/hero-images.yaml`:

```yaml
- file: MySpecies.jpg
  species: Genus species
  common_name: Common name
  photographer: Photographer Name
  institution: Institution name
  license: CC BY 4.0
  source_url: https://source.url
  alt_text: Description for screen readers
```

The carousel only shows images for which a file actually exists in `public/images/species/`.

### Maps
1. Add the Leaflet HTML file to `public/kart/mymap.html`
2. Add an entry to `src/data/tools.yaml`:

```yaml
- id: mymap
  title:
    no: "Norsk tittel"
    en: "English title"
  description:
    no: "Norsk skildring av kartet."
    en: "English description of the map."
  iframe_src: /kart/mymap.html
```

### GitHub repositories
Edit `src/data/repositories.yaml`. Each entry needs both `no` and `en` descriptions:

```yaml
- name: "MyRepo"
  url: "https://github.com/gjearevoll/MyRepo"
  description:
    no: "Norsk skildring."
    en: "English description."
```

### Team members
The core team is fetched automatically from the NVA project record. To add or update someone, edit the project in NVA. ORCID identifiers are looked up automatically via the Cristin API.

---

## Reusing this template for a new project

This codebase is designed as a reusable template for NVA-driven research project websites. To adapt it:

1. **Fork the repository**

2. **Edit `src/config/project.yaml`** — update all project-specific values:
   - Project name, tagline, institution (in both `no` and `en`)
   - Contact email, GitHub org URL, institution website
   - `nva.cristin_project_id` — the Cristin project ID from your NVA project URL

3. **Replace hero images** in `public/images/species/` and update `src/data/hero-images.yaml`

4. **Update `src/data/repositories.yaml`** with your project's GitHub repos

5. **Update `src/data/tools.yaml`** with your map products (or leave empty)

6. **Update page content** — the stat cards and hero text on the index pages are project-specific and should be edited directly in `src/pages/no/index.astro` and `src/pages/en/index.astro`

7. **Update `astro.config.mjs`** — set `site` and `base` to match your GitHub Pages URL

8. **Configure GitHub Pages** — enable GitHub Pages in repo settings, set source to GitHub Actions

Everything else (publications, team, funders) will be populated automatically from NVA once the Cristin project ID is correct.
