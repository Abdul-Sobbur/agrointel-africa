"""All Earth Engine access lives here. Each function returns plain Python data."""
from __future__ import annotations

import calendar
import datetime as dt
import json
import os
import urllib.request
from pathlib import Path

import ee

from .config import CROPLAND_PIXEL_FRAC, DS, LANDCOVER, NORMAL_START, NORMAL_END, WATER_BASE_YEARS

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
    if len(bands) == 1:  # single-band output is named after the reducer ("mean"/"sum") unless set
        reducer = reducer.setOutputs(bands)
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


def _worldcover() -> ee.Image:
    return ee.ImageCollection(DS["worldcover"]).first().select("Map")


def cropland_mask() -> ee.Image:
    """1 where a 250 m MODIS pixel is mostly farmland (share of 10 m WorldCover cropland pixels)."""
    modis = ee.Image(ee.ImageCollection(DS["modis_ndvi"]).first()).select("NDVI").projection()
    frac = (_worldcover().eq(40).reduceResolution(reducer=ee.Reducer.mean(), maxPixels=1024)
            .reproject(crs=modis))
    return frac.gte(CROPLAND_PIXEL_FRAC)


def ndvi_crop_monthly_year(fc, year: int) -> dict[str, dict]:
    """Monthly NDVI over farmland pixels only (ESA WorldCover 2021 cropland)."""
    col, mask = _ndvi_col(), cropland_mask()
    bands = []
    for m in range(1, 13):
        s = ee.Date.fromYMD(year, m, 1)
        bands.append(_safe(col.filterDate(s, s.advance(1, "month")), f"m{m:02d}")
                     .multiply(0.0001).updateMask(mask).rename(f"m{m:02d}"))
    return _reduce(ee.Image.cat(bands), fc, scale=250, tile_scale=8)


# ---------------------------------------------------------------- land cover (ESA WorldCover) and soil (iSDAsoil)
def land_cover(fc) -> dict[str, dict]:
    """Area (km2) of each WorldCover class per unit, at 100 m."""
    wc, area = _worldcover(), ee.Image.pixelArea().divide(1e6)
    img = ee.Image.cat([wc.eq(c).multiply(area).rename(f"c{c}") for c in LANDCOVER])
    return _reduce(img, fc, scale=100, reducer=ee.Reducer.sum(), tile_scale=8)


def _isda(name: str, band: str = "mean_0_20") -> ee.Image:
    return ee.Image(f"{DS['isda']}/{name}").select(band)


def soil_stats(fc) -> dict[str, dict]:
    """Topsoil (0-20 cm) iSDAsoil means per unit over land that is not built-up or water.

    Values are back-transformed per pixel before averaging, as the iSDAsoil
    catalogue specifies: pH x/10; organic C, P and K exp(x/10)-1; total N exp(x/100)-1;
    depth to bedrock in cm as stored.
    """
    wc = _worldcover()
    land = wc.neq(50).And(wc.neq(80))
    expm1 = lambda img, d: img.divide(d).exp().subtract(1)  # noqa: E731
    num = ee.Image.cat([
        _isda("ph").divide(10).rename("ph"),
        expm1(_isda("carbon_organic"), 10).rename("oc"),
        expm1(_isda("nitrogen_total"), 100).rename("n"),
        expm1(_isda("phosphorus_extractable"), 10).rename("p"),
        expm1(_isda("potassium_extractable"), 10).rename("k"),
        _isda("bedrock_depth", "mean_0_200").rename("depth"),
    ]).updateMask(land)
    out = _reduce(num, fc, scale=250, tile_scale=8)
    tex = _isda("texture_class", "texture_0_20").rename("texture").updateMask(land)
    modes = _reduce(tex, fc, scale=250, reducer=ee.Reducer.mode(), tile_scale=8)
    for k, row in out.items():
        row["texture"] = modes.get(k, {}).get("texture")
    return out


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


def _bbox(geometry: dict) -> list[float]:
    """[west, south, east, north] of a GeoJSON Polygon or MultiPolygon, computed locally."""
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    xs = [p[0] for poly in polys for ring in poly for p in ring]
    ys = [p[1] for poly in polys for ring in poly for p in ring]
    return [min(xs), min(ys), max(xs), max(ys)]


def thumbnail(img: ee.Image, geometry: dict, out: Path, dims: int = 720) -> list[list[float]]:
    """Save a PNG clipped to the region and return its Leaflet bounds [[south, west], [north, east]].

    The bounding box is built client-side: getThumbURL needs a region it can
    serialise, which a server-computed geometry.bounds() is not.
    """
    w, s, e, n = _bbox(geometry)
    region = ee.Geometry.Rectangle([w, s, e, n], "EPSG:4326", False)
    # Mask with the region instead of clip(): clipping MODIS sinusoidal tiles can fail
    # with "Unable to transform edge"; a constant image clipped in EPSG:4326 cannot.
    inside = ee.Image.constant(1).clip(ee.Geometry(geometry))
    url = img.updateMask(inside).getThumbURL(
        {"region": region, "dimensions": dims, "format": "png", "crs": "EPSG:4326"})
    out.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=180) as r:
        out.write_bytes(r.read())
    return [[s, w], [n, e]]


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
        entry = {}
        for layer, im in vis.items():
            try:
                entry["bounds"] = thumbnail(im, f["geometry"], out_dir / f"{key}_{layer}.png")
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
    loss = gfc.select("lossyear").gte(21).multiply(ee.Image.pixelArea()).divide(1e4).rename("loss_ha_since_2021")
    cover = gfc.select("treecover2000").rename("treecover2000")
    forest = _reduce(loss, fc, scale=30, reducer=ee.Reducer.sum(), id_prop="id")
    tc = _reduce(cover, fc, scale=30, id_prop="id")
    for k in stats:
        stats[k].update(forest.get(k, {}))
        stats[k].update(tc.get(k, {}))
    return stats


# ---------------------------------------------------------------- reservoirs (JRC outline + Sentinel-1 area)
def reservoir_shape(res: dict) -> dict:
    """Outline of the largest water body in the JRC maximum extent inside the reservoir's box."""
    box = ee.Geometry.Rectangle(res["box"], "EPSG:4326", False)
    vscale = max(30, res["scale"] * 1.5)
    water = ee.Image(DS["jrc_water"]).select("max_extent").eq(1).selfMask()
    vecs = water.reduceToVectors(geometry=box, scale=vscale, geometryType="polygon", eightConnected=True,
                                 labelProperty="w", maxPixels=1e10, bestEffort=True)
    vecs = vecs.map(lambda f: f.set("a", f.geometry().area(maxError=vscale)))
    best = ee.Feature(vecs.sort("a", False).first())
    geom = best.geometry().simplify(maxError=vscale)
    seed = ee.Geometry.Point(res["seed"])
    info = ee.Dictionary({"geometry": geom, "area_km2": best.getNumber("a").divide(1e6),
                          "seed_dist_m": geom.distance(seed, maxError=50)}).getInfo()
    return info


def reservoir_monthly(shapes: dict, keys: list[str], year: int, last_month: int, scale: int) -> dict[str, dict]:
    """Sentinel-1 water area (km2) per reservoir and month, within the outline plus a 150 m margin."""
    fc = ee.FeatureCollection([ee.Feature(ee.Geometry(shapes[k]["geometry"]).buffer(150, 50), {"key": k}) for k in keys])
    bounds = fc.geometry().bounds(100)
    s1 = (ee.ImageCollection(DS["s1"]).filterBounds(bounds)
          .filter(ee.Filter.eq("instrumentMode", "IW"))
          .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV")).select("VV"))
    area = ee.Image.pixelArea().divide(1e6)
    bands = []
    for m in range(1, last_month + 1):
        s = ee.Date.fromYMD(year, m, 1)
        c = s1.filterDate(s, s.advance(1, "month"))
        wet = _safe(c, "VV", "median").lt(-16)
        bands.append(wet.multiply(area).rename(f"m{m:02d}"))
    sizes = ee.List([s1.filterBounds(ee.Geometry(shapes[k]["geometry"]))
                     .filterDate(ee.Date.fromYMD(year, m, 1), ee.Date.fromYMD(year, m, 1).advance(1, "month")).size()
                     for k in keys for m in range(1, last_month + 1)]).getInfo()
    res = _reduce(ee.Image.cat(bands), fc, scale=scale, reducer=ee.Reducer.sum(), tile_scale=16)
    # a month with no Sentinel-1 pass over a reservoir sums to 0 over masked pixels: report it as missing
    for i, k in enumerate(keys):
        for m in range(1, last_month + 1):
            if sizes[i * last_month + m - 1] == 0 and k in res:
                res[k][f"m{m:02d}"] = None
    return res



# ---------------------------------------------------------------- land change and fires
def forest_loss(fc, last_year: int) -> dict[str, dict]:
    """Hansen tree-cover loss (km2) per year 2001-last_year, plus 2000 forest area (canopy >= 30%)."""
    gfc, area = ee.Image(DS["hansen"]), ee.Image.pixelArea().divide(1e6)
    forest = gfc.select("treecover2000").gte(30)
    ly = gfc.select("lossyear")
    bands = [ly.eq(y - 2000).And(forest).multiply(area).rename(f"y{y}") for y in range(2001, last_year + 1)]
    bands.append(forest.multiply(area).rename("forest2000"))
    return _reduce(ee.Image.cat(bands), fc, scale=30, reducer=ee.Reducer.sum(), tile_scale=16)


def burned_area(fc, first: int, last: int) -> tuple[dict[str, dict], str | None]:
    """Area burned at least once in each calendar year (km2), MODIS MCD64A1, and the last month covered."""
    col = ee.ImageCollection(DS["burned"]).select("BurnDate")
    area = ee.Image.pixelArea().divide(1e6)
    bands = [_safe(col.filterDate(f"{y}-01-01", f"{y + 1}-01-01"), f"y{y}", "max").gt(0).multiply(area).rename(f"y{y}")
             for y in range(first, last + 1)]
    latest = col.aggregate_max("system:time_start").getInfo()
    last_month = dt.datetime.fromtimestamp(latest / 1000, dt.timezone.utc).strftime("%Y-%m") if latest else None
    return _reduce(ee.Image.cat(bands), fc, scale=500, reducer=ee.Reducer.sum(), tile_scale=4), last_month


def cropland_trend(fc) -> dict[str, dict]:
    """MODIS land cover cropland (class 12) and cropland/natural mosaic (class 14) area (km2) per year."""
    col = ee.ImageCollection(DS["modis_lc"]).select("LC_Type1")
    years = [int(y) for y in col.aggregate_array("system:index").map(lambda i: ee.String(i).slice(0, 4)).getInfo()]
    area = ee.Image.pixelArea().divide(1e6)
    bands = []
    for y in years:
        img = col.filterDate(f"{y}-01-01", f"{y + 1}-01-01").first()
        img = ee.Image(img)
        bands += [img.eq(12).multiply(area).rename(f"c{y}"), img.eq(14).multiply(area).rename(f"m{y}")]
    return _reduce(ee.Image.cat(bands), fc, scale=500, reducer=ee.Reducer.sum(), tile_scale=4)


def population(fc, year: int) -> dict[str, dict]:
    """People per unit from WorldPop (100 m, unconstrained)."""
    img = (ee.ImageCollection(DS["worldpop"]).filter(ee.Filter.eq("country", "GHA"))
           .filter(ee.Filter.eq("year", year)).first())
    return _reduce(ee.Image(img).select("population").rename("pop"), fc, scale=100, reducer=ee.Reducer.sum(), tile_scale=8)
