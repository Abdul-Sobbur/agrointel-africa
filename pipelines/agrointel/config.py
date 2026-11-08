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
}

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
# (days). Simplified from FAO ECOCROP optimal ranges.
CROPS = [
    {"key": "maize",   "name": "Maize",          "rain": (600, 1200),  "temp": (21, 28.5), "los": 100, "annual": True, "max_annual": 1900},
    {"key": "sorghum", "name": "Sorghum",        "rain": (500, 1000),  "temp": (25, 33),   "los": 90,  "annual": True, "max_annual": 1300},
    {"key": "millet",  "name": "Pearl millet",   "rain": (400, 900),   "temp": (26, 34),   "los": 75,  "annual": True, "max_annual": 1100},
    {"key": "rice",    "name": "Rice (lowland)", "rain": (900, 1600) , "temp": (24, 32),   "los": 110, "annual": True},
    {"key": "soy",     "name": "Soybean",        "rain": (600, 1100),  "temp": (24, 30),   "los": 100, "annual": True, "max_annual": 1700},
    {"key": "gnut",    "name": "Groundnut",      "rain": (500, 1000),  "temp": (25, 32),   "los": 90,  "annual": True, "max_annual": 1500},
    {"key": "yam",     "name": "Yam",            "rain": (1000, 1500), "temp": (25, 30),   "los": 180, "annual": False},
    {"key": "cassava", "name": "Cassava",        "rain": (1000, 1800), "temp": (24, 30),   "los": 180, "annual": False},
    {"key": "cocoa",   "name": "Cocoa",          "rain": (1400, 2000), "temp": (22, 28),   "los": 210, "annual": False, "forest": True},
]
