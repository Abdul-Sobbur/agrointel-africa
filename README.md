# AgroIntel Africa

**Agricultural intelligence for Ghana from open satellite and climate data.**
Rainfall, drought, crop health, surface water, risk and farm monitoring for all 16 regions, updated weekly with Google Earth Engine.

**Live site:** https://abdul-sobbur.github.io/agrointel-africa/

> A personal, noncommercial portfolio project. Figures are computed automatically and have not been validated in the field.

## What it does

| Module | Answers | Built from |
| --- | --- | --- |
| A. Crop intelligence | Is vegetation healthy? Which crops fit this climate? Is the season on track? | MODIS NDVI, VCI, FAO-style suitability |
| B. Climate intelligence | How much rain, compared with normal? Is drought building? When did the rains start? | CHIRPS v3, SPI-3, ERA5-Land |
| C. Water intelligence | How much surface water is there now? Where do crops run short of water? | Sentinel-1 radar, JRC Surface Water, MODIS PET |
| D. Agricultural risk | Where are drought, flood, degradation and production risk highest? | Combined indicators, NDVI anomaly maps |
| E. Farm management | How big is this field, how green is it, and has forest been cleared on it? | Leaflet tracing, Sentinel-2, Hansen GFC |

## How it works

```
Earth Engine (CHIRPS, ERA5-Land, MODIS, Sentinel-1/2, JRC, Hansen)
        │  pipelines/run_pipeline.py — weekly on GitHub Actions
        ▼
data/cache/*.json (history)   web/data/*.json + maps/*.png (latest)
        │  GitHub Pages
        ▼
web/ — static site: index.html, app.js, styles.css (Leaflet maps)
```

* **Pipelines** (`pipelines/`): Python and the Earth Engine API. `agrointel/earth.py` holds every Earth Engine call; `agrointel/analysis.py` holds the maths (SPI, onset, VCI, suitability, risk) and is unit-tested.
* **History is cached** in `data/cache/`, so weekly runs only fetch the latest year. The first run builds 1991–present and takes longer.
* **Website** (`web/`): plain HTML, CSS and JavaScript, no build step. It reads `web/data/`.

## Repository layout

```
data/regions.geojson        Ghana's 16 regions (geoBoundaries ADM1)
data/farms.geojson          farms monitored with Sentinel-2 (add yours here)
data/cache/                 cached historical series (written by the pipeline)
pipelines/agrointel/        config, Earth Engine access, analysis
pipelines/run_pipeline.py   the weekly job
pipelines/make_sample_data.py  offline sample data (runs the pipeline against a fake Earth Engine)
pipelines/tests/            unit tests
web/                        the website
docs/SETUP.md               step-by-step setup
docs/METHODS.md             data sources, methods and limitations
```

## Quick start

```bash
pip install -r pipelines/requirements.txt
python -m pytest -q pipelines/tests          # unit tests
python pipelines/make_sample_data.py          # offline sample data, no Earth Engine needed
python -m http.server -d web 8000             # open http://localhost:8000
```

With Earth Engine access (`earthengine authenticate`):

```bash
EE_PROJECT=ee-aasobbur python pipelines/run_pipeline.py
```

Full instructions, including the GitHub Actions secret: [docs/SETUP.md](docs/SETUP.md).

## Add a farm to monitor

1. On the site, open **Farms → Map a farm**, trace the field and save it.
2. Download its GeoJSON and add the feature to `data/farms.geojson` (keep a unique `id`, plus `region` and `crop`).
3. The next weekly run adds a Sentinel-2 greenness history and a forest-loss check.

Only map farms with the farmer's permission.

## Data and credits

CHIRPS v3 (UCSB Climate Hazards Center) · ERA5-Land (ECMWF / Copernicus Climate Change Service) · MODIS MOD13Q1 and MOD16A2 (NASA LP DAAC) · Sentinel-1 and Sentinel-2 (ESA Copernicus) · JRC Global Surface Water (EC JRC / Google) · Hansen Global Forest Change v1.13 (University of Maryland) · geoBoundaries (CC BY 4.0) · Base maps and imagery © Esri and contributors.
Processing with [Google Earth Engine](https://earthengine.google.com/) under its noncommercial terms.

Code: MIT licence. Data remain under their providers' licences.
