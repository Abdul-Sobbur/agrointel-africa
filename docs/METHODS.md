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
| Boundaries | geoBoundaries ADM1, Ghana | – | 16 regions |

## Methods

* **Normals:** 1991–2020 for rainfall totals and temperature; 1998–2020 for daily season indicators; 2001–2020 for NDVI; 2017–2021 for radar water.
* **Rainfall anomaly:** observed January-to-latest-month total against the normal for the same months.
* **SPI-3:** three-month totals; for each calendar month a gamma distribution is fitted to 1991–2020 non-zero totals, combined with the probability of zero rain, and mapped to a standard normal (McKee et al., 1993). Months whose normal three-month total is under 30 mm are left blank.
* **Onset:** first 3-day spell with ≥ 20 mm (≥ 2 wet days) after 1 April in the north or 1 March in the south, with no 7-day dry spell in the next 30 days. **Cessation:** first wet day after 1 September (north) or 15 October (south) followed by < 10 mm in 20 days. Dry day: < 1 mm.
* **Vegetation condition (VCI):** standardised form of Kogan (1995): the month's regional NDVI departure from the same month in other years (2001–present), divided by the larger of the standard deviation and a 0.04 noise floor, mapped through the normal CDF to 0–100 (50 = typical). Only complete months are used.
* **Surface water:** median Sentinel-1 VV < −16 dB within the JRC maximum water extent, summed by region.
* **Crop suitability:** trapezoid scores for rainfall (growing-season rainfall for annual crops, annual rainfall for perennials), mean temperature and rainy-season length against simplified FAO ECOCROP ranges; FAO classes S1 (≥ 80), S2 (≥ 60), S3 (≥ 40), N.
* **Risk indices (0–100):** transparent heuristics in `pipelines/agrointel/analysis.py::risk_scores`. Composite = 35% drought + 25% production + 20% flood + 20% degradation.

## Limitations

* Regional averages hide variation within regions.
* No field validation yet; treat outputs as indicators, not facts.
* Radar can mistake smooth surfaces for water; the JRC mask reduces this.
* Suitability ignores soil and terrain for now (iSDAsoil is the planned addition).
* Yield forecasting needs harvest data and is not included.
