"""All Earth Engine access lives here. Each function returns plain Python data."""
from __future__ import annotations

import calendar
import datetime as dt
import json
import os
import urllib.request
from pathlib import Path

import ee

from .config import DS, NORMAL_START, NORMAL_END, WATER_BASE_YEARS

import logging

log = logging.getLogger("agrointel")
GHANA_BOX = [-3.35, 4.65, 1.25, 11.2]


# ---------------------------------------------------------------- setup
def init() -> None:
    """Authenticate with a service-account key (CI) or local user credentials."""
    project = os.environ.get("EE_PROJECT", "ee-aasobbur")
    key = os.environ.get("EE_SERVICE_ACCOUNT_KEY")
    if key:
        info = json.loads(key)
        creds = ee.ServiceAccountCredentials(info["client_email"], key_data=key)
        ee.Initialize(creds, project=project)
    else:
        ee.Initialize(project=project)  # after `earthengine authenticate`


def feature_collection(geojson: dict, id_prop: str = "key") -> ee.FeatureCollection:
    feats = [ee.Feature(ee.Geometry(f["geometry"]), {id_prop: f["properties"][id_prop]}) for f in geojson["features"]]
    return ee.FeatureCollection(feats)


def _empty(band: str) -> ee.Image:
    return ee.Image.constant(0).toFloat().updateMask(ee.Image.constant(0)).rename(band)


def _safe(col: ee.ImageCollection, band: str, how: str = "mean") -> ee.Image:
    """Reduce a collection to one band, or a fully masked band if it is empty."""
    reduced = getattr(col, how)()
    return ee.Image(ee.Algorithms.If(col.size().gt(0), reduced.rename(band), _empty(band))).rename(band)


def _reduce(img: ee.Image, fc: ee.FeatureCollection, scale: float, reducer=None, id_prop: str = "key",
            tile_scale: int = 4) -> dict[str, dict]:
    """reduceRegions → {id: {band: value}} without shipping geometries back."""
    reducer = reducer or ee.Reducer.mean()
    bands = img.bandNames().getInfo()
    res = img.reduceRegions(collection=fc, reducer=reducer, scale=scale, tileScale=tile_scale)
    res = res.select([id_prop] + bands, None, False).getInfo()
    return {f["properties"][id_prop]: {b: f["properties"].get(b) for b in bands} for f in res["features"]}


# ---------------------------------------------------------------- rainfall (CHIRPS v3)
def chirps_latest_date() -> dt.date:
    col = ee.ImageCollection(DS["chirps"]).filterDate("2020-01-01", "2100-01-01")
    ms = col.aggregate_max("system:time_start").getInfo()
    return dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc).date()


def chirps_monthly_year(fc, year: int, last_month: int = 12) -> dict[str, dict]:
    """Monthly rainfall totals (mm) per region for one year."""
    col = ee.ImageCollection(DS["chirps"]).select("precipitation")
    bands = []
    for m in range(1, last_month + 1):
        s = ee.Date.fromYMD(year, m, 1)
        bands.append(_safe(col.filterDate(s, s.advance(1, "month")), f"m{m:02d}", "sum"))
    return _reduce(ee.Image.cat(bands), fc, scale=5566)


def chirps_daily_year(fc, year: int, until: dt.date | None = None) -> tuple[list[dt.date], dict[str, list[float]]]:
    """Daily regional-mean rainfall for one year (up to `until`)."""
    end = (until + dt.timedelta(days=1)).isoformat() if until else f"{year + 1}-01-01"
    col = ee.ImageCollection(DS["chirps_daily"]).select("precipitation").filterDate(f"{year}-01-01", end)
    times = col.aggregate_array("system:time_start").getInfo()
    dates = [dt.datetime.fromtimestamp(t / 1000, dt.timezone.utc).date() for t in times]
    if not dates:
        return [], {}
    names = [f"d{i:03d}" for i in range(len(dates))]
    img = col.toBands().rename(names)
    res = _reduce(img, fc, scale=5566)
    return dates, {k: [v.get(n) or 0.0 for n in names] for k, v in res.items()}


# ---------------------------------------------------------------- temperature (ERA5-Land)
def era5_annual_temps(fc, first: int, last: int) -> dict[str, dict]:
    """Annual mean 2 m temperature (deg C) per region, plus the 1991-2020 mean as 'normal'."""
    col = ee.ImageCollection(DS["era5_monthly"]).select("temperature_2m")
    bands = [_safe(col.filterDate(f"{y}-01-01", f"{y + 1}-01-01"), f"y{y}").subtract(273.15).rename(f"y{y}")
             for y in range(first, last + 1)]
    bands.append(col.filterDate(f"{NORMAL_START}-01-01", f"{NORMAL_END + 1}-01-01").mean()
                 .subtract(273.15).rename("normal"))
    return _reduce(ee.Image.cat(bands), fc, scale=11132)


# ---------------------------------------------------------------- evapotranspiration (MODIS)
def _pet_month(col, m: int, year: int | None = None) -> ee.Image:
    days = calendar.monthrange(year or 2001, m)[1]
    c = col.filter(ee.Filter.calendarRange(m, m, "month"))
    if year:
        c = c.filterDate(f"{year}-01-01", f"{year + 1}-01-01")
    else:
        c = c.filterDate("2001-01-01", f"{NORMAL_END + 1}-01-01")
    c = c.map(lambda i: i.updateMask(i.lt(32700)))
    return _safe(c, f"m{m:02d}").multiply(0.1 / 8 * days).rename(f"m{m:02d}")


def pet_monthly(fc, year: int | None) -> dict[str, dict]:
    """Monthly potential evapotranspiration (mm). year=None gives the 2001-2020 mean."""
    col = ee.ImageCollection(DS["modis_et"]).select("PET")
    return _reduce(ee.Image.cat([_pet_month(col, m, year) for m in range(1, 13)]), fc,
                   scale=1000 if year else 2500, tile_scale=16)


# ---------------------------------------------------------------- vegetation (MODIS NDVI)
def _ndvi_col() -> ee.ImageCollection:
    """MOD13Q1 NDVI with cloudy, snowy and unreliable pixels removed (SummaryQA 0 good, 1 marginal)."""
    def qa(i):
        return ee.Image(i.select("NDVI").updateMask(i.select("SummaryQA").lte(1))
                        .copyProperties(i, ["system:time_start"]))
    return ee.ImageCollection(DS["modis_ndvi"]).map(qa)


def ndvi_monthly_year(fc, year: int) -> dict[str, dict]:
    col = _ndvi_col()
    bands = []
    for m in range(1, 13):
        s = ee.Date.fromYMD(year, m, 1)
        bands.append(_safe(col.filterDate(s, s.advance(1, "month")), f"m{m:02d}").multiply(0.0001).rename(f"m{m:02d}"))
    return _reduce(ee.Image.cat(bands), fc, scale=500)


def ndvi_latest() -> tuple[ee.Image, dt.date]:
    col = _ndvi_col().sort("system:time_start", False)
    img = ee.Image(col.first())
    when = dt.datetime.fromtimestamp(img.get("system:time_start").getInfo() / 1000, dt.timezone.utc).date()
    return img.multiply(0.0001).rename("NDVI"), when


def ndvi_anomaly(img: ee.Image, when: dt.date) -> ee.Image:
    doy = when.timetuple().tm_yday
    base = (_ndvi_col()
            .filterDate("2001-01-01", f"{NORMAL_END + 1}-01-01")
            .filter(ee.Filter.dayOfYear(max(1, doy - 8), min(366, doy + 8)))
            .mean().multiply(0.0001))
    return img.subtract(base).rename("anom")


# ---------------------------------------------------------------- water (Sentinel-1 + JRC)
def _s1_water(start: str, end: str) -> ee.Image:
    box = ee.Geometry.Rectangle(GHANA_BOX)
    s1 = (ee.ImageCollection(DS["s1"]).filterBounds(box).filterDate(start, end)
          .filter(ee.Filter.eq("instrumentMode", "IW"))
          .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
          .select("VV"))
    ever_water = ee.Image(DS["jrc_water"]).select("max_extent").eq(1)
    return _safe(s1, "VV", "median").lt(-16).And(ever_water).rename("water")


def water_month(year: int, month: int) -> ee.Image:
    s = dt.date(year, month, 1)
    e = dt.date(year + (month == 12), month % 12 + 1, 1)
    return _s1_water(s.isoformat(), e.isoformat())


def water_areas(fc, year: int, month: int) -> dict[str, dict]:
    """Water area (km2) per region this month and the mean for the same month in baseline years."""
    area = ee.Image.pixelArea().divide(1e6)
    bands = [water_month(year, month).multiply(area).rename("current")]
    base_years = range(WATER_BASE_YEARS[0], WATER_BASE_YEARS[1] + 1)
    bands += [water_month(y, month).multiply(area).rename(f"b{y}") for y in base_years]
    bands.append(ee.Image(DS["jrc_water"]).select("occurrence").gte(75).multiply(area).rename("permanent"))
    return _reduce(ee.Image.cat(bands), fc, scale=100, reducer=ee.Reducer.sum(), tile_scale=8)


# ---------------------------------------------------------------- map images
NDVI_PALETTE = ["8c6842", "b8985f", "d6c470", "a0be58", "5c9c46", "267034", "124a28"]
ANOM_PALETTE = ["a6611a", "dfc27d", "f5f5f5", "80cdc1", "018571"]


def thumbnail(img: ee.Image, geom: ee.Geometry, out: Path, dims: int = 720) -> list[list[float]]:
    """Save a clipped PNG and return its Leaflet bounds [[south, west], [north, east]]."""
    bounds = geom.bounds()
    url = img.clip(geom).getThumbURL({"region": bounds, "dimensions": dims, "format": "png", "crs": "EPSG:4326"})
    out.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=180) as r:
        out.write_bytes(r.read())
    ring = bounds.coordinates().get(0).getInfo()
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    return [[min(ys), min(xs)], [max(ys), max(xs)]]


def region_maps(geojson: dict, out_dir: Path, water_year: int, water_mon: int) -> dict:
    """NDVI, NDVI-anomaly and surface-water PNGs for every region."""
    ndvi, when = ndvi_latest()
    anom = ndvi_anomaly(ndvi, when)
    water = water_month(water_year, water_mon)
    vis = {
        "ndvi": ndvi.visualize(min=0.05, max=0.85, palette=NDVI_PALETTE),
        "anomaly": anom.visualize(min=-0.15, max=0.15, palette=ANOM_PALETTE),
        "water": water.selfMask().visualize(palette=["1f6fb5"]),
    }
    out: dict = {"ndvi_date": when.isoformat(), "water_month": f"{water_year}-{water_mon:02d}", "regions": {}}
    errors = 0
    for f in geojson["features"]:
        key = f["properties"]["key"]
        geom = ee.Geometry(f["geometry"])
        entry = {}
        for layer, im in vis.items():
            try:
                entry["bounds"] = thumbnail(im, geom, out_dir / f"{key}_{layer}.png")
                entry[layer] = True
            except Exception as e:  # keep going: one failed image should not lose the rest
                errors += 1
                log.warning("map %s %s failed: %s", key, layer, e)
        if entry:
            out["regions"][key] = entry
    if not out["regions"]:
        raise RuntimeError(f"all {errors} map images failed")
    return out


# ---------------------------------------------------------------- farms (Sentinel-2 + Hansen)
def _s2_ndvi(col):
    def f(img):
        scl = img.select("SCL")
        ok = scl.eq(4).Or(scl.eq(5)).Or(scl.eq(6)).Or(scl.eq(7))
        return img.normalizedDifference(["B8", "B4"]).rename("NDVI").updateMask(ok)
    return col.map(f)


def farm_stats(farms_geojson: dict, year: int, last_month: int) -> dict[str, dict]:
    fc = feature_collection(farms_geojson, "id")
    box = fc.geometry().bounds()
    s2 = ee.ImageCollection(DS["s2"]).filterBounds(box).filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 80))
    bands = []
    for m in range(1, 13):
        if m <= last_month:
            s = ee.Date.fromYMD(year, m, 1)
            bands.append(_safe(_s2_ndvi(s2.filterDate(s, s.advance(1, "month"))), f"m{m:02d}", "median"))
        base = _s2_ndvi(s2.filterDate("2019-01-01", "2024-01-01").filter(ee.Filter.calendarRange(m, m, "month")))
        bands.append(_safe(base, f"n{m:02d}", "median"))
    stats = _reduce(ee.Image.cat(bands), fc, scale=10, id_prop="id")
    gfc = ee.Image(DS["hansen"])
    loss = gfc.select("lossyear").gte(21).multiply(ee.Image.pixelArea()).divide(1e4).rename("loss_ha_2021")
    cover = gfc.select("treecover2000").rename("treecover2000")
    forest = _reduce(loss, fc, scale=30, reducer=ee.Reducer.sum(), id_prop="id")
    tc = _reduce(cover, fc, scale=30, id_prop="id")
    for k in stats:
        stats[k].update(forest.get(k, {}))
        stats[k].update(tc.get(k, {}))
    return stats
