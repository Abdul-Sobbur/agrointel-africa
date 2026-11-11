# Changelog

## 1.1 (November 2026): AI for Climate at COP31

* **Ask AgroIntel:** a chat assistant for farmers and officers. It finds the place and topic in a question and answers from the site's satellite data and the 16-day forecast, with voice input and read-aloud. Optional AI mode answers in Twi, Dagbani, Hausa, Ewe or French through a small proxy (`assistant/worker.js`).
* **Forecast and advice:** 16-day rain and temperature forecast for every district, with heat alerts, dry-spell warnings, planting, spraying and flood advice, and the weekly crop water shortfall.
* **Irrigation planner:** how many hectares of tomato, onion, pepper, leafy vegetables, maize or rice each reservoir can water, by planting month and irrigation method.
* **Early warning (AI):** a machine-learning model, retrained weekly on every district's seasons since 2002, gives the chance of a poor season two months ahead, with tested accuracy shown.

## 1.0 (November 2026)

First complete version.

* **Coverage:** Ghana's 16 regions and 260 districts; every season from 2001 (rainfall from 1981); weekly automatic updates on GitHub Actions.
* **Climate:** rainfall against the 1991–2020 normal, monthly anomalies, SPI-3 drought index, temperature trend, onset, cessation, rainy days and dry spells.
* **Crop:** vegetation health and condition (VCI) on farmland only where cropland allows, crop growth curves, FAO-style suitability for nine crops using climate and topsoil, season assessment, soil profile and land cover.
* **Water:** radar surface water, water balance and aridity, and a monitor for ten reservoirs (Tono, Vea, Bontanga, Golinga, Weija, Barekese, Owabi, Kpong, Bui, Lake Volta) with monthly area since 2015.
* **Risk:** drought, flood, degradation, production and composite risk; vegetation anomaly maps; tree-cover loss, burned area and cropland trend.
* **Farms:** trace a field on satellite imagery for area and perimeter; Sentinel-2 monitoring and forest-loss check for registered farms.
* **Compare:** two places or two seasons side by side.
* **Reports:** printable A4 national, regional and district reports with the author's details, logo and notes.
* **My workspace:** role-based view, watched areas and reservoirs, personal alert thresholds, CSV download, export and import.
* **Design:** new logo and a light, photo-led landing page.

## Planned for 2.0

* Chat assistant that answers questions from the data.
* Accounts with shared team workspaces and email alerts.
* Mining-scar mapping.
* Validation against Ghana Meteorological Agency stations and field reports with partners.
