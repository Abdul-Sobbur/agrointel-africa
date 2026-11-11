# Data and methods

## Data

| Theme | Dataset (Earth Engine ID) | Resolution | Used for |
| --- | --- | --- | --- |
| Rainfall totals | CHIRPS v3 (`UCSB-CHC/CHIRPS/V3/DAILY_RNL`) | ~5.5 km, 1981– | Monthly totals, anomalies, SPI |
| Rainfall timing | CHIRPS v3 IMERG-disaggregated (`UCSB-CHC/CHIRPS/V3/DAILY_SAT`) | ~5.5 km, daily, 1998– | Onset, cessation, rainy days, dry spells |
| Temperature | ERA5-Land monthly (`ECMWF/ERA5_LAND/MONTHLY_AGGR`) | ~11 km | Annual means, trend, suitability |
| Vegetation | MODIS NDVI (`MODIS/061/MOD13Q1`), SummaryQA ≤ 1 | 250 m, 16-day | Regional NDVI, VCI, trend, maps |
| Field greenness | Sentinel-2 SR (`COPERNICUS/S2_SR_HARMONIZED`) | 10 m | Farm NDVI (SCL cloud mask) |
| Evapotranspiration | MODIS PET (`MODIS/061/MOD16A2`) | 500 m, 8-day | Water balance, aridity |
| Water | Sentinel-1 GRD (`COPERNICUS/S1_GRD`), JRC GSW 1.4 | 10–30 m | Monthly water area, permanent water |
| Forest | Hansen GFC v1.13 (`UMD/hansen/global_forest_change_2025_v1_13`) | 30 m | Tree cover 2000, loss 2021–2025 |
| Land cover | ESA WorldCover v200 (`ESA/WorldCover/v200`), 2021 | 10 m | Cropland mask, land-cover shares |
| Soil | iSDAsoil Africa v1 (`ISDASOIL/Africa/v1/*`), 0–20 cm | 30 m | pH, organic C, N, P, K, depth, texture |
| Reservoirs | JRC GSW 1.4 `max_extent` (outline), Sentinel-1 GRD (area) | 20–100 m, monthly, 2015– | Tono, Vea, Bontanga, Golinga, Weija, Barekese, Owabi, Kpong, Bui, Lake Volta |
| Burned area | MODIS MCD64A1 (`MODIS/061/MCD64A1`) | 500 m, monthly | Area burned at least once per calendar year |
| Cropland trend | MODIS MCD12Q1 (`MODIS/061/MCD12Q1`) LC_Type1 | 500 m, annual | Cropland (12) + half of cropland mosaic (14) |
| Population | WorldPop Global Project (`WorldPop/GP/100m/pop`), 2020 | 100 m | Harvest outlook (food per person) |
| Boundaries | geoBoundaries ADM1 and ADM2, Ghana (2019) | – | 16 regions, 260 districts |

## Methods

* **Normals:** 1991–2020 for rainfall totals and temperature; 1998–2020 for daily season indicators; 2001–2020 for NDVI; 2017–2021 for radar water.
* **Rainfall anomaly:** observed January-to-latest-month total against the normal for the same months.
* **SPI-3:** three-month totals; for each calendar month a gamma distribution is fitted to 1991–2020 non-zero totals, combined with the probability of zero rain, and mapped to a standard normal (McKee et al., 1993). Months whose normal three-month total is under 30 mm are left blank.
* **Onset:** first 3-day spell with ≥ 20 mm (≥ 2 wet days) after 1 April in the north or 1 March in the south, with no 7-day dry spell in the next 30 days. **Cessation:** first wet day after 1 September (north) or 15 October (south) followed by < 10 mm in 20 days. Dry day: < 1 mm.
* **Vegetation condition (VCI):** standardised form of Kogan (1995): the month's regional NDVI departure from the same month in other years (2001–present), divided by the larger of the standard deviation and a 0.04 noise floor, mapped through the normal CDF to 0–100 (50 = typical). Only complete months are used.
* **Farmland-only vegetation:** a 250 m MODIS pixel is farmland when ≥ 30% of the 10 m WorldCover pixels in it are cropland (class 40), found with `reduceResolution` onto the MODIS grid. A unit uses farmland-only NDVI and VCI when cropland is ≥ 3% of its land and at least 15 baseline years of farmland NDVI exist; otherwise all vegetation. The NDVI trend (degradation) always uses all land. WorldCover maps most cocoa as tree cover, so forest-zone units usually fall back to all vegetation.
* **Soil:** iSDAsoil 0–20 cm means, back-transformed per pixel as the catalogue specifies (pH x/10; organic carbon, extractable P and K exp(x/10)−1; total N exp(x/100)−1; depth to bedrock in cm), averaged over land that is not built-up or water at 250 m; texture is the most common USDA class. Rating bands are in `analysis.py::SOIL_BANDS`.
* **Reservoirs:** outline = largest polygon of JRC `max_extent` inside a hand-drawn box per reservoir (`config.RESERVOIRS`), vectorised once and cached; the pipeline logs the distance to a check point and warns if it exceeds 2 km. Monthly open-water area = Sentinel-1 VV monthly median < −16 dB inside the outline + 150 m (20 m analysis; 40 m for Bui, 100 m for Lake Volta). Months without a Sentinel-1 pass are left blank. Usual = 2017–2023 mean for the calendar month; full = 95th percentile of all months. Surface area, not volume.
* **Land change:** tree-cover loss = Hansen `lossyear` pixels within 2000 canopy ≥ 30%, summed per year at 30 m (forest 2000 = canopy ≥ 30%). Burned area = pixels with any `BurnDate` in the calendar year, at 500 m; the current year is partial. Cropland = MODIS LC_Type1 class 12 plus half of class 14, at 500 m; smallholder plots under trees are under-counted, so the trend matters more than the total. Mining is not separated from other forest loss.
* **Forecast and advice:** Open-Meteo daily forecast (16 days) at each district's centroid; dry spell ≥ 7 days < 1 mm, hot ≥ 35 °C, severe ≥ 38 °C, heavy rain ≥ 20 mm/day, very heavy ≥ 50 mm/day; weekly crop water shortfall = Σ ET0 − Σ rain over 7 days.
* **Irrigation planner:** FAO-56 single crop coefficients (Kc ini/mid/end and stage lengths for tomato, onion, pepper, leafy vegetables, maize, paddy rice) × MODIS PET monthly normal; effective rain by USDA-SCS from the 1991–2020 normal; paddy adds 4 mm/day percolation and 150 mm land soaking; gross need = net / efficiency (50, 70, 90%). Available water = area × usable depth × share − 1.05 × PET × 0.8 × area over the season.
* **Early warning (AI):** L2-regularised logistic regression (Newton's method, numpy) on district-seasons 2002–last year; six standardised features at end of July; target = Sep–Oct NDVI anomaly in the lowest quintile of the district's own years; skill from leave-one-year-out cross-validation (AUC, accuracy, hit rate in the top 20% of predictions). Retrained every run; output `web/data/model.json`.
* **Harvest outlook:** index = cropland km² × (0.6 + 0.8 × condition) ÷ population, relative to the national total; condition = 0.6 × VCI/100 + 0.4 × (1 − early-warning probability). Classes: ≥ 1.5 likely surplus, 1–1.5 self-sufficient, 0.5–1 some shortfall, < 0.5 large shortfall. Population: WorldPop GP 100 m, 2020 (`config.POP_YEAR`). Links: the 12 largest shortfalls (people-equivalents) to their 2 nearest likely-surplus districts by great-circle distance. Not a production estimate; trade, stocks and tree-grown food are not included.
* **Surface water:** median Sentinel-1 VV < −16 dB within the JRC maximum water extent, summed by region.
* **Crop suitability:** trapezoid scores for rainfall (growing-season rainfall for annual crops, annual rainfall for perennials), mean temperature and rainy-season length against simplified FAO ECOCROP ranges; FAO classes S1 (≥ 80), S2 (≥ 60), S3 (≥ 40), N. Soil multiplies the climate score by 0.7 + 0.3 × soil fit, where soil fit combines topsoil pH against each crop's range, depth to bedrock against its rooting need, and a 0.6 penalty on heavy clays for groundnut, yam and cassava. Fertility (N, P, K, organic carbon) is reported but not scored, since it can be corrected.
* **Risk indices (0–100):** transparent heuristics in `pipelines/agrointel/analysis.py::risk_scores`. Composite = 35% drought + 25% production + 20% flood + 20% degradation.

## Districts and past seasons

* Every indicator is computed for regions and for 260 districts. Districts are assigned to the region they overlap most. Map images are made per region; district views zoom into them.
* Each region and district file holds one block per season from 2001. For past seasons rainfall covers January to December, SPI-3 is reported for the end of the main season (October in the north, November in the south), vegetation condition is the average over the growing season, and evapotranspiration uses the 2001–2020 average. Surface water is computed for the latest month only.

## Limitations

* Regional and district averages hide variation within them; the smallest urban districts are smaller than one rainfall pixel (~5.5 km).
* District boundaries are the 2019 set (260 districts); Ghana has created further districts since.
* No field validation yet; treat outputs as indicators, not facts.
* Radar can mistake smooth surfaces for water; the JRC mask reduces this.
* iSDAsoil values are model predictions for 2001–2017, not measurements; suitability ignores slope and terrain.
* The cropland mask is a single 2021 map, so farmland that appeared or disappeared since then is misclassified.
* Yield forecasting needs harvest data and is not included.
