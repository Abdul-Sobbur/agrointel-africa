"""Static configuration: regions, crops, datasets and analysis periods."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"
WEB_DATA = ROOT / "web" / "data"
REGIONS_GEOJSON = DATA_DIR / "regions.geojson"
DISTRICTS_GEOJSON = DATA_DIR / "districts.geojson"
FARMS_GEOJSON = DATA_DIR / "farms.geojson"

# Climate normal period (WMO standard) and other baselines
NORMAL_START, NORMAL_END = 1991, 2020
SEASON_BASE = (1998, 2020)     # daily-rainfall baseline (CHIRPS v3 SAT starts in 1998)
NDVI_BASE_START = 2001          # MODIS Terra full years start in 2001
TEMP_TREND_START = 1996
FIRST_YEAR = 2001               # earliest season the website lets you browse (MODIS NDVI starts 2000)
WATER_BASE_YEARS = (2017, 2021)  # Sentinel-1 years used as the water baseline

# Earth Engine dataset IDs
DS = {
    "chirps": "UCSB-CHC/CHIRPS/V3/DAILY_RNL",          # monthly totals 1981-, ~5.5 km (ERA5-disaggregated)
    "chirps_daily": "UCSB-CHC/CHIRPS/V3/DAILY_SAT",    # daily timing 1998-, IMERG-disaggregated (realistic wet days)
    "era5_monthly": "ECMWF/ERA5_LAND/MONTHLY_AGGR",     # band: temperature_2m (K), ~11 km
    "modis_ndvi": "MODIS/061/MOD13Q1",                  # band: NDVI (x0.0001), 250 m, 16-day
    "modis_et": "MODIS/061/MOD16A2",                    # band: PET (x0.1 kg/m2 per 8 days), 500 m
    "s1": "COPERNICUS/S1_GRD",                          # band: VV (dB), 10 m
    "s2": "COPERNICUS/S2_SR_HARMONIZED",                # 10 m optical
    "jrc_water": "JRC/GSW1_4/GlobalSurfaceWater",       # band: occurrence (%)
    "hansen": "UMD/hansen/global_forest_change_2025_v1_13",  # band: lossyear (1-25 = 2001-2025)
    "worldcover": "ESA/WorldCover/v200",                # 10 m land cover, 2021; class 40 = cropland
    "isda": "ISDASOIL/Africa/v1",                       # iSDAsoil 30 m soil predictions (prefix)
    "burned": "MODIS/061/MCD64A1",                      # burned area, 500 m monthly, band BurnDate (day of year)
    "modis_lc": "MODIS/061/MCD12Q1",                    # land cover, 500 m annual; LC_Type1 12 cropland, 14 mosaic
}
HANSEN_LAST_YEAR = 2025         # last loss year in the Hansen version above

# Farmland-only vegetation: a 250 m MODIS pixel counts as farmland when at least this
# share of its 10 m WorldCover pixels is cropland; a unit switches to farmland-only
# NDVI when cropland covers at least CROPLAND_MIN_PCT of its land.
CROPLAND_PIXEL_FRAC = 0.3
CROPLAND_MIN_PCT = 3.0

# ESA WorldCover classes reported in the land-cover breakdown
LANDCOVER = {10: "Tree cover", 20: "Shrubland", 30: "Grassland", 40: "Cropland", 50: "Built-up",
             60: "Bare / sparse", 80: "Water", 90: "Wetland", 95: "Mangroves"}

# Minutes the pipeline may spend back-filling history before it defers the rest to the next run
HISTORY_BUDGET_MIN = 110

# Reservoirs. The outline is found automatically: the largest water body in the JRC
# maximum water extent inside `box` [west, south, east, north]. `seed` is a point that
# should fall on (or very near) the reservoir and is only used to check the outline.
# `scale` is the Sentinel-1 analysis resolution in metres (coarser for the largest lakes).
RESERVOIR_FIRST_YEAR = 2015    # Sentinel-1 coverage over Ghana is regular from 2016-17
RESERVOIR_BASE = (2017, 2023)  # years that define the usual area for each month
RESERVOIRS = [
    {"key": "tono", "name": "Tono", "region": "upper-east", "use": "Irrigation (about 2,490 ha), water supply",
     "box": [-1.26, 10.78, -1.04, 10.96], "seed": [-1.15, 10.87], "scale": 20},
    {"key": "vea", "name": "Vea", "region": "upper-east", "use": "Irrigation, Bolgatanga water supply",
     "box": [-0.93, 10.82, -0.79, 10.93], "seed": [-0.86, 10.87], "scale": 20},
    {"key": "bontanga", "name": "Bontanga", "region": "northern", "use": "Irrigation (rice, vegetables)",
     "box": [-1.11, 9.51, -0.96, 9.65], "seed": [-1.03, 9.58], "scale": 20},
    {"key": "golinga", "name": "Golinga", "region": "northern", "use": "Irrigation",
     "box": [-1.00, 9.32, -0.90, 9.41], "seed": [-0.95, 9.36], "scale": 20},
    {"key": "weija", "name": "Weija", "region": "greater-accra", "use": "Water supply for western Accra, irrigation",
     "box": [-0.43, 5.54, -0.29, 5.73], "seed": [-0.36, 5.60], "scale": 20},
    {"key": "barekese", "name": "Barekese", "region": "ashanti", "use": "Kumasi water supply",
     "box": [-1.79, 6.79, -1.65, 6.91], "seed": [-1.72, 6.84], "scale": 20},
    {"key": "owabi", "name": "Owabi", "region": "ashanti", "use": "Kumasi water supply",
     "box": [-1.75, 6.70, -1.66, 6.78], "seed": [-1.70, 6.74], "scale": 20},
    {"key": "kpong", "name": "Kpong headpond", "region": "eastern", "use": "Hydropower, irrigation, Accra water supply",
     "box": [0.02, 6.10, 0.17, 6.29], "seed": [0.09, 6.17], "scale": 20},
    {"key": "bui", "name": "Bui", "region": "bono", "use": "Hydropower, irrigation",
     "box": [-2.60, 8.22, -2.00, 8.85], "seed": [-2.25, 8.35], "scale": 40},
    {"key": "volta", "name": "Lake Volta", "region": None, "use": "Akosombo hydropower, transport, fisheries",
     "box": [-1.70, 6.28, 0.65, 9.25], "seed": [-0.05, 7.20], "scale": 100},
]

# Region metadata. "regime": uni = one rainy season (north), bi = two seasons (south).
REGIONS = {
    "ahafo":         {"capital": "Goaso", "zone": "Moist semi-deciduous forest", "regime": "bi", "forest": True},
    "ashanti":       {"capital": "Kumasi", "zone": "Moist semi-deciduous forest", "regime": "bi", "forest": True},
    "bono":          {"capital": "Sunyani", "zone": "Forest–savannah transition", "regime": "bi", "forest": True},
    "bono-east":     {"capital": "Techiman", "zone": "Forest–savannah transition", "regime": "bi", "forest": False},
    "central":       {"capital": "Cape Coast", "zone": "Coastal savannah and moist forest", "regime": "bi", "forest": True},
    "eastern":       {"capital": "Koforidua", "zone": "Semi-deciduous forest", "regime": "bi", "forest": True},
    "greater-accra": {"capital": "Accra", "zone": "Coastal savannah", "regime": "bi", "forest": False},
    "north-east":    {"capital": "Nalerigu", "zone": "Guinea savannah", "regime": "uni", "forest": False},
    "northern":      {"capital": "Tamale", "zone": "Guinea savannah", "regime": "uni", "forest": False},
    "oti":           {"capital": "Dambai", "zone": "Guinea savannah and transition", "regime": "bi", "forest": False},
    "savannah":      {"capital": "Damongo", "zone": "Guinea savannah", "regime": "uni", "forest": False},
    "upper-east":    {"capital": "Bolgatanga", "zone": "Sudan savannah", "regime": "uni", "forest": False},
    "upper-west":    {"capital": "Wa", "zone": "Guinea savannah", "regime": "uni", "forest": False},
    "volta":         {"capital": "Ho", "zone": "Coastal savannah to forest mosaic", "regime": "bi", "forest": False},
    "western":       {"capital": "Sekondi-Takoradi", "zone": "Wet evergreen forest", "regime": "bi", "forest": True},
    "western-north": {"capital": "Sefwi Wiawso", "zone": "Moist evergreen forest", "regime": "bi", "forest": True},
}

# Crop requirements: rainfall range (mm) per growing season for annual crops and per
# year for perennials, mean temperature range (deg C), minimum rainy-season length
# (days). Simplified from FAO ECOCROP optimal ranges. Soil: optimal topsoil pH range,
# minimum soil depth (cm) and, for root and pod crops, a preference for light soils.
CROPS = [
    {"key": "maize",   "name": "Maize",          "rain": (600, 1200),  "temp": (21, 28.5), "los": 100, "annual": True, "max_annual": 1900, "ph": (5.5, 7.5), "depth": 50},
    {"key": "sorghum", "name": "Sorghum",        "rain": (500, 1000),  "temp": (25, 33),   "los": 90,  "annual": True, "max_annual": 1300, "ph": (5.5, 7.5), "depth": 50},
    {"key": "millet",  "name": "Pearl millet",   "rain": (400, 900),   "temp": (26, 34),   "los": 75,  "annual": True, "max_annual": 1100, "ph": (5.0, 7.5), "depth": 40},
    {"key": "rice",    "name": "Rice (lowland)", "rain": (900, 1600) , "temp": (24, 32),   "los": 110, "annual": True, "ph": (5.0, 7.0), "depth": 40},
    {"key": "soy",     "name": "Soybean",        "rain": (600, 1100),  "temp": (24, 30),   "los": 100, "annual": True, "max_annual": 1700, "ph": (6.0, 7.5), "depth": 50},
    {"key": "gnut",    "name": "Groundnut",      "rain": (500, 1000),  "temp": (25, 32),   "los": 90,  "annual": True, "max_annual": 1500, "ph": (5.5, 7.0), "depth": 50, "light": True},
    {"key": "yam",     "name": "Yam",            "rain": (1000, 1500), "temp": (25, 30),   "los": 180, "annual": False, "ph": (5.5, 6.5), "depth": 60, "light": True},
    {"key": "cassava", "name": "Cassava",        "rain": (1000, 1800), "temp": (24, 30),   "los": 180, "annual": False, "ph": (5.0, 7.0), "depth": 50, "light": True},
    {"key": "cocoa",   "name": "Cocoa",          "rain": (1400, 2000), "temp": (22, 28),   "los": 210, "annual": False, "forest": True, "ph": (5.0, 7.5), "depth": 100},
]
