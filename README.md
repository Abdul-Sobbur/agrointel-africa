# AgroIntel Africa

**Agricultural intelligence for Ghana from open satellite and climate data.**
Rainfall, drought, crop health, surface water, risk and farm monitoring for Ghana's 16 regions and 260 districts, every season since 2001, updated weekly with Google Earth Engine.

**Live site:** https://abdul-sobbur.github.io/agrointel-africa/

> A personal, noncommercial portfolio project. Figures are computed automatically and have not been validated in the field.

## What it does (version 1.1, November 2026)

| Area | Answers | Built from |
| --- | --- | --- |
| Crop | Is vegetation healthy on farmland? Which crops fit the climate and soil? Is the season on track? | MODIS NDVI and VCI with an ESA WorldCover cropland mask, FAO-style suitability, iSDAsoil |
| Climate | How much rain against normal? Is drought building? When did the rains start and stop? | CHIRPS v3, SPI-3, ERA5-Land |
| Water | How much surface water is there? How full are Tono, Vea, Bontanga, Weija, Bui, Lake Volta and others? Where do crops run short of water? | Sentinel-1 radar, JRC Surface Water, MODIS PET |
| Risk | Where are drought, flood, degradation and production risk highest? How much forest is lost and land burned each year? | Combined indicators, Hansen GFC, MODIS burned area and land cover |
| Farms | How big is this field, how green is it, and has forest been cleared on it? | Leaflet tracing, Sentinel-2, Hansen GFC |
| Compare | How do two districts, or two seasons, differ? | All of the above |
| Reports | A printable national, regional or district report with the user's name, organisation, logo and notes | All of the above |
| Ask AgroIntel | “When should I plant in Tolon?” Answers from the data and forecast; optional AI mode in Twi, Dagbani, Hausa, Ewe, French | Site data, Open-Meteo, optional LLM proxy (`assistant/`, see docs/ASSISTANT.md) |
| Forecast and advice | Rain, heat and dry spells for the next 16 days, and what to do about them | Open-Meteo |
| Irrigation planner | How many hectares each reservoir can water, by crop and planting month | FAO-56, MODIS PET, Sentinel-1 reservoir area |
| Harvest outlook | Which districts are likely to have a food surplus or shortfall, and where surplus could go | Cropland, crop condition, early warning, WorldPop |
| Early warning (AI) | Chance of a poor season two months ahead, with tested accuracy | Logistic regression retrained weekly on 2002–present |
| My workspace | Role-based view (extension, insurance, water, NGO, research, farming) with watched areas, own alert levels and CSV download | All of the above, stored in the browser |

Coverage: 16 regions and 260 districts, every season since 2001 (rainfall since 1981), updated every Monday.

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
data/districts.geojson      260 districts (geoBoundaries ADM2, 2019), each tagged with its region
data/farms.geojson          farms monitored with Sentinel-2 (empty in v1; add farms with permission)
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

CHIRPS v3 (UCSB Climate Hazards Center) · ERA5-Land (ECMWF / Copernicus Climate Change Service) · MODIS MOD13Q1 and MOD16A2 (NASA LP DAAC) · Sentinel-1 and Sentinel-2 (ESA Copernicus) · JRC Global Surface Water (EC JRC / Google) · Hansen Global Forest Change v1.13 (University of Maryland) · MODIS MCD64A1 and MCD12Q1 (NASA) · ESA WorldCover 2021 · iSDAsoil (iSDA, CC BY 4.0) · geoBoundaries (CC BY 4.0) · Base maps and imagery © Esri and contributors.
Hero photos via Unsplash (Oswald Elsaboath, Tomiwa Ogunmodede).
Processing with [Google Earth Engine](https://earthengine.google.com/) under its noncommercial terms.

Code: MIT licence. Data remain under their providers' licences.

See [CHANGELOG.md](CHANGELOG.md) for what is in each version.
