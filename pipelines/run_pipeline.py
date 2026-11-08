"""Run the AgroIntel Africa pipeline: Earth Engine → JSON + PNG files for the website.

Usage:
    python pipelines/run_pipeline.py                  # normal weekly run (regions + districts)
    python pipelines/run_pipeline.py --no-maps        # skip map images (faster)
    python pipelines/run_pipeline.py --no-districts   # regions only
    python pipelines/run_pipeline.py --rebuild        # ignore cached history

Historical series are cached in data/cache/ so routine runs only fetch the
current and previous year. Every unit (region or district) gets one JSON file
holding its static context (normals, trends, suitability) and an indicator
block for every season from FIRST_YEAR to the current one.
"""
from __future__ import annotations

import argparse
import calendar
import datetime as dt
import json
import logging
import math
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from agrointel import analysis as A  # noqa: E402
from agrointel import earth as E  # noqa: E402
from agrointel.config import (CACHE_DIR, CROPLAND_MIN_PCT, DISTRICTS_GEOJSON, FARMS_GEOJSON,  # noqa: E402
                              FIRST_YEAR, HISTORY_BUDGET_MIN, LANDCOVER, NDVI_BASE_START, NORMAL_END,
                              NORMAL_START, REGIONS, REGIONS_GEOJSON, SEASON_BASE, TEMP_TREND_START, WEB_DATA)

log = logging.getLogger("agrointel")
GROWING = {"uni": range(5, 11), "bi": range(3, 12)}   # months used for a past season's vegetation score
SEASON_END = {"uni": 10, "bi": 11}                     # month whose SPI-3 summarises a past season
DEADLINE = time.monotonic() + HISTORY_BUDGET_MIN * 60  # after this, missing history waits for the next run


# ---------------------------------------------------------------- helpers
def load(name: str) -> dict:
    p = CACHE_DIR / name
    return json.loads(p.read_text()) if p.exists() else {}


def save(name: str, data: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / name).write_text(json.dumps(data, separators=(",", ":"), sort_keys=True))


def retry(fn, *a, tries=3, **k):
    for i in range(tries):
        try:
            return fn(*a, **k)
        except Exception as e:  # Earth Engine has transient errors; back off and retry
            if i == tries - 1:
                raise
            log.warning("retrying %s after error: %s", fn.__name__, e)
            time.sleep(10 * (i + 1))


def soft(label, fn, *a, default=None, **k):
    """Run a stage; on failure log a warning and return `default` so the rest still runs."""
    try:
        return retry(fn, *a, **k)
    except Exception as e:
        log.warning("%s failed, continuing without it: %s", label, e)
        return default


def r(v, d=1):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else round(float(v), d)


def nn(x):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else x


def as_tuple_series(d: dict) -> dict[tuple[int, int], float]:
    return {(int(k[:4]), int(k[5:7])): v for k, v in d.items()}


def doy(s):
    return dt.date.fromisoformat(s).timetuple().tm_yday if s else None


# ---------------------------------------------------------------- fetching stages
def update_monthly(fc, keys, cache_name, fetch, first_year, year, last_month, rebuild):
    """Fill a {unit: {"YYYY-MM": value}} cache, always refreshing the last two years."""
    cache = {} if rebuild else load(cache_name)
    have = {ym[:4] for k in cache.values() for ym in k}
    deferred = 0
    for y in range(first_year, year + 1):
        if str(y) in have and y < year - 1:
            continue
        if y < year - 1 and time.monotonic() > DEADLINE:
            deferred += 1
            continue
        lm = last_month if y == year else 12
        res = soft(f"{cache_name} {y}", fetch, fc, y, lm, default={}) if fetch is E.chirps_monthly_year \
            else soft(f"{cache_name} {y}", fetch, fc, y, default={})
        n = sum(1 for row in res.values() for v in row.values() if v is not None)
        (log.info if n else log.warning)("%s %s: %d values", cache_name, y, n)
        for k in keys:
            row = res.get(k, {})
            for m in range(1, 13):
                v = row.get(f"m{m:02d}")
                ym = f"{y}-{m:02d}"
                if v is not None and m <= lm:
                    cache.setdefault(k, {})[ym] = round(v, 4)
                else:
                    cache.get(k, {}).pop(ym, None)
        save(cache_name, cache)
    if deferred:
        log.warning("%s: time budget used, %d past years left for the next run", cache_name, deferred)
    return cache


def static_cache(name, label, fetch, fc, rebuild):
    """Datasets that do not change between runs (soil, land cover): fetch once, then reuse."""
    data = {} if rebuild else load(name)
    if not data:
        data = soft(label, fetch, fc, default={}) or {}
        n = sum(1 for row in data.values() for v in row.values() if v is not None)
        (log.info if n else log.warning)("%s: %d values", label, n)
        if n:
            save(name, data)
    return data


def update_season_history(fc, keys, regimes, cache_name, last_year, rebuild):
    """Season indicators for every complete year from SEASON_BASE[0] to last_year."""
    cache = {} if rebuild else load(cache_name)
    for y in range(SEASON_BASE[0], last_year + 1):
        if all(str(y) in cache.get(k, {}) for k in keys):
            continue
        if y < last_year and time.monotonic() > DEADLINE:
            log.warning("%s: time budget used, %s onwards left for the next run", cache_name, y)
            break
        dates, daily = soft(f"season history {y}", E.chirps_daily_year, fc, y, default=([], {}))
        log.info("%s %s: %d days", cache_name, y, len(dates))
        if not dates:
            continue
        for k in keys:
            if k in daily:
                ind = A.season_indicators(dates, daily[k], regimes[k])
                ind["total"] = round(sum(daily[k]), 1)
                cache.setdefault(k, {})[str(y)] = ind
        save(cache_name, cache)
    return cache


def fetch_level(level, geo, keys, regimes, year, last_month, latest, nyear, nmonth, wy, wm, rebuild):
    """Everything Earth Engine has to say about one set of units."""
    sfx = "" if level == "region" else "_districts"
    fc = E.feature_collection(geo)
    out = {}
    out["rain"] = update_monthly(fc, keys, f"chirps_monthly{sfx}.json", E.chirps_monthly_year, NORMAL_START,
                                 year, last_month, rebuild)
    out["seasons"] = update_season_history(fc, keys, regimes, f"season_history_sat{sfx}.json", year - 1, rebuild)
    dates, daily = soft(f"{level} daily rainfall", E.chirps_daily_year, fc, year, latest, default=([], {}))
    log.info("%s daily rainfall %s: %d days", level, year, len(dates))
    out["current_season"] = {k: A.season_indicators(dates, daily.get(k, []), regimes[k]) for k in keys}
    out["ndvi"] = update_monthly(fc, keys, f"ndvi_monthly_qa{sfx}.json", E.ndvi_monthly_year, NDVI_BASE_START,
                                 nyear, nmonth, rebuild)
    out["land"] = static_cache(f"landcover{sfx}.json", f"{level} land cover", E.land_cover, fc, rebuild)
    out["soil"] = static_cache(f"soil{sfx}.json", f"{level} soil", E.soil_stats, fc, rebuild)
    out["ndvi_crop"] = update_monthly(fc, keys, f"ndvi_monthly_crop{sfx}.json", E.ndvi_crop_monthly_year,
                                      NDVI_BASE_START, nyear, nmonth, rebuild)
    log.info("%s temperature", level)
    out["temps"] = soft(f"{level} temperature", E.era5_annual_temps, fc, TEMP_TREND_START, year, default={})
    pet_norm = {} if rebuild else load(f"pet_normal{sfx}.json")
    if not pet_norm:
        pet_norm = soft(f"{level} PET normal", E.pet_monthly, fc, None, default={})
        if pet_norm:
            save(f"pet_normal{sfx}.json", pet_norm)
    out["pet_norm"] = pet_norm
    out["pet_now"] = soft(f"{level} PET {year}", E.pet_monthly, fc, year, default={})
    log.info("%s water %s-%02d", level, wy, wm)
    out["water"] = soft(f"{level} water", E.water_areas, fc, wy, wm, default={})
    return out


# ---------------------------------------------------------------- assembly
def build_unit(k, data, regime, forest, year, last_month, latest, wy, wm):
    """Static context plus one indicator block per season for a single unit."""
    ser = as_tuple_series(data["rain"].get(k, {}))
    normal = A.monthly_normals(ser)
    spi_all = A.spi(ser, 3)

    hist = data["seasons"].get(k, {})
    base = {y: h for y, h in hist.items() if SEASON_BASE[0] <= int(y) <= SEASON_BASE[1]}
    onset_n = A.mean_doy([h.get("onset") for h in base.values()])
    cess_n = A.mean_doy([h.get("cessation") for h in base.values()])
    rd_n = round(sum(h["rainy_days"] for h in base.values()) / len(base)) if base else None
    ds_n = round(sum(h["dry_spells"] or 0 for h in base.values()) / len(base), 1) if base else None
    los_n = (cess_n - onset_n) if onset_n and cess_n else None

    trow = data["temps"].get(k, {})
    tyears = list(range(TEMP_TREND_START, year + 1))
    tvals = [trow.get(f"y{y}") for y in tyears]
    slope, _ = A.linear_trend(tyears, [v if v is not None else float("nan") for v in tvals])
    known = [v for v in tvals if v is not None]
    tnorm = trow.get("normal") or (sum(known) / len(known) if known else float("nan"))

    lc = data["land"].get(k, {})
    land_km2 = sum(v or 0 for c, v in lc.items() if c != "c80")
    crop_pct = (lc.get("c40") or 0) / land_km2 * 100 if land_km2 else None
    land = {"pct": {LANDCOVER[int(c[1:])]: r((v or 0) / sum(x or 0 for x in lc.values()) * 100, 1)
                    for c, v in lc.items()} if lc else {}, "cropland_pct": r(crop_pct, 1),
            "cropland_km2": r(lc.get("c40"), 0), "source": "ESA WorldCover 2021"}

    all_ser = as_tuple_series(data["ndvi"].get(k, {}))
    crop_ser = as_tuple_series(data["ndvi_crop"].get(k, {}))
    base_years = {y for (y, m) in crop_ser if NDVI_BASE_START <= y <= NORMAL_END}
    use_crop = crop_pct is not None and crop_pct >= CROPLAND_MIN_PCT and len(base_years) >= 15
    nser = crop_ser if use_crop else all_ser
    ndvi_basis = "cropland" if use_crop else "all land"
    nnorm = [nn(x) for x in A.monthly_normals(nser, NDVI_BASE_START, NORMAL_END)]
    ann = {}
    for (y, m), v in all_ser.items():  # greening trend over all land: degradation is not only on farms
        ann.setdefault(y, []).append(v)
    ay = sorted(y for y, v in ann.items() if len(v) == 12)
    nslope, _ = A.linear_trend(ay, [sum(ann[y]) / 12 for y in ay])
    ntrend = 0.0 if math.isnan(nslope) else nslope * 10

    pn, pc = data["pet_norm"].get(k, {}), data["pet_now"].get(k, {})
    pet_norm = [pn.get(f"m{m:02d}") for m in range(1, 13)]
    pet_cur = [pc.get(f"m{m:02d}") if pc.get(f"m{m:02d}") is not None else pn.get(f"m{m:02d}") for m in range(1, 13)]

    w = data["water"].get(k, {})
    wb = [w.get(f"b{y}") for y in range(2017, 2022) if w.get(f"b{y}") is not None]
    wnorm = sum(wb) / len(wb) if wb else None
    wpct = (w.get("current") or 0) / wnorm * 100 if wnorm and wnorm > 0.5 else None

    soil = A.soil_profile(data["soil"].get(k))
    suit = A.crop_suitability(sum(normal), tnorm, los_n, forest, A.season_rain(normal, regime), soil)

    years = {}
    for y in range(FIRST_YEAR, year + 1):
        cur = y == year
        lm = last_month if cur else 12
        monthly = [ser.get((y, m)) for m in range(1, lm + 1)]
        if not any(v is not None for v in monthly):
            continue
        tot, ntot = sum(v or 0 for v in monthly), sum(normal[:lm])
        anom = (tot / ntot - 1) * 100 if ntot else 0.0
        month_anom = [r((v / n - 1) * 100, 0) if v is not None and n >= 1 else None for v, n in zip(monthly, normal)]
        spi_year = [spi_all.get((y, m)) for m in range(1, 13)]
        ref = lm if cur else SEASON_END[regime]
        spi_ref = spi_year[ref - 1]
        recent = [v for v in spi_year[max(0, ref - 3):ref] if v is not None]

        s = data["current_season"].get(k, {}) if cur else hist.get(str(y), {})
        los = (doy(s.get("cessation")) - doy(s.get("onset"))) if s.get("onset") and s.get("cessation") else None

        ncur = [nser.get((y, m)) for m in range(1, 13)]
        avail = [m for m in range(1, 13) if ncur[m - 1] is not None]
        if cur or (avail and max(avail) < 12):
            nlm = max(avail) if avail else None
            vci = A.vci(nser, y, nlm) if nlm else None
            vci_basis = f"latest:{nlm}" if nlm else None
        else:
            vals = [A.vci(nser, y, m) for m in GROWING[regime] if (y, m) in nser]
            vci = round(sum(vals) / len(vals), 1) if vals else None
            nlm, vci_basis = (12 if avail else None), "season"

        p_used = [monthly[m - 1] if m <= lm else normal[m - 1] for m in range(1, 13)]
        pet = pet_cur if cur else pet_norm
        balance = [r((p or 0) - (e or 0), 0) if e is not None else None for p, e in zip(p_used, pet)]
        petsum = sum(e for e in pet if e is not None)
        aridity = sum(v or 0 for v in p_used) / petsum if petsum else None

        risk = A.risk_scores(spi3_latest=spi_ref, season_anom_pct=anom, dry_spells=s.get("dry_spells"),
                             spi3_recent_max=max(recent) if recent else None, water_pct=wpct if cur else None,
                             ndvi_trend_decade=ntrend, vci_latest=vci)
        status = A.season_status(anom, vci, spi_ref, (s.get("dry_spells") or 0) - (ds_n or 0))
        years[str(y)] = {
            "rain": {"last_month": lm, "monthly": [r(v) for v in monthly], "total": r(tot, 0),
                     "normal_to_date": r(ntot, 0), "anomaly_pct": r(anom, 1), "monthly_anom": month_anom,
                     "spi3": [r(v, 2) for v in spi_year], "spi3_ref": r(spi_ref, 2), "spi_ref_month": ref,
                     "spi_class": A.spi_class(spi_ref)},
            "season": {"onset": s.get("onset"), "cessation": s.get("cessation"), "dry_spells": s.get("dry_spells"),
                       "rainy_days": s.get("rainy_days"), "los": los, "last_date": s.get("last_date")},
            "ndvi": {"monthly": [r(v, 3) for v in ncur], "latest_month": nlm, "vci": vci, "vci_basis": vci_basis},
            "temp": r(trow.get(f"y{y}"), 2),
            "balance": {"p": [r(v, 0) for v in p_used], "pet": [r(v, 0) for v in pet], "balance": balance,
                        "projected": [m > lm for m in range(1, 13)], "aridity": r(aridity, 2),
                        "pet_basis": "observed" if cur else "normal",
                        "deficit_months": sum(1 for b in balance if b is not None and b < -40)},
            "risk": risk, "status": status,
        }

    static = {
        "current_year": year, "latest_date": latest.isoformat(),
        "rain_normal": [r(v) for v in normal], "annual_normal": r(sum(normal), 0),
        "season_normal": {"onset_doy": onset_n, "cessation_doy": cess_n, "los": los_n,
                          "rainy_days": rd_n, "dry_spells": ds_n},
        "temp": {"years": tyears, "annual": [r(v, 2) for v in tvals], "trend_decade": r(slope * 10, 2),
                 "normal": r(tnorm, 2)},
        "ndvi_normal": [r(v, 3) for v in nnorm], "ndvi_trend_decade": r(ntrend, 3), "ndvi_basis": ndvi_basis,
        "water": {"month": f"{wy}-{wm:02d}", "current_km2": r(w.get("current"), 1), "normal_km2": r(wnorm, 1),
                  "pct": r(wpct, 0), "permanent_km2": r(w.get("permanent"), 1)},
        "suitability": suit, "soil": soil, "land": land,
    }
    return static, years


# ---------------------------------------------------------------- main
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-maps", action="store_true")
    ap.add_argument("--no-districts", action="store_true")
    ap.add_argument("--rebuild", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    E.init()
    latest = E.chirps_latest_date()
    year = latest.year
    last_day = calendar.monthrange(year, latest.month)[1]
    last_month = latest.month if latest.day == last_day else latest.month - 1
    if last_month < 1:  # very early in a year: report the previous full year
        year, last_month = year - 1, 12
    log.info("CHIRPS data to %s → reporting %s, months 1-%s", latest, year, last_month)

    # Only complete MODIS months: month m counts once we are past the 16th of month m+1.
    today = dt.date.today()
    back = 1 if today.day >= 16 else 2
    nyear, nmonth = today.year, today.month - back
    if nmonth < 1:
        nyear, nmonth = nyear - 1, nmonth + 12
    wy, wm = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)

    regions_geo = json.loads(REGIONS_GEOJSON.read_text())
    levels = [("region", regions_geo)]
    if not args.no_districts and DISTRICTS_GEOJSON.exists():
        levels.append(("district", json.loads(DISTRICTS_GEOJSON.read_text())))

    summaries = {}
    for level, geo in levels:
        feats = geo["features"]
        keys = [f["properties"]["key"] for f in feats]
        parent = {f["properties"]["key"]: (f["properties"]["key"] if level == "region" else f["properties"]["region"])
                  for f in feats}
        regimes = {k: REGIONS[parent[k]]["regime"] for k in keys}
        log.info("=== %s level: %d units", level, len(keys))
        data = fetch_level(level, geo, keys, regimes, year, last_month, latest, nyear, nmonth, wy, wm, args.rebuild)

        out_dir = WEB_DATA / f"{level}s"
        out_dir.mkdir(parents=True, exist_ok=True)
        units = []
        for f in feats:
            k, name = f["properties"]["key"], f["properties"]["name"]
            meta = REGIONS[parent[k]]
            static, years = build_unit(k, data, meta["regime"], meta["forest"], year, last_month, latest, wy, wm)
            unit = {"key": k, "name": name, "level": level, "region": parent[k], "updated": today.isoformat(),
                    "capital": meta["capital"] if level == "region" else None, "zone": meta["zone"],
                    "regime": meta["regime"], "forest": meta["forest"], **static, "years": years}
            (out_dir / f"{k}.json").write_text(json.dumps(unit, separators=(",", ":")))
            units.append({"key": k, "name": name, "region": parent[k], "years": {
                y: {"rain_anom": b["rain"]["anomaly_pct"], "vci": b["ndvi"]["vci"], "spi3": b["rain"]["spi3_ref"],
                    "risk": {x: b["risk"][x] for x in ("composite", "drought", "flood")}, "status": b["status"]}
                for y, b in years.items()}})
            if level == "region":
                cy = years.get(str(year), {})
                log.info("%s: rain %s%%, VCI %s, risk %s", k, cy.get("rain", {}).get("anomaly_pct"),
                         cy.get("ndvi", {}).get("vci"), cy.get("risk", {}).get("composite"))
        summaries[level] = units
        (WEB_DATA / f"summary_{level}.json").write_text(json.dumps({"units": units}, separators=(",", ":")))
        log.info("%s level done: %d units", level, len(units))

    # Maps (regions only)
    maps_meta = None
    if not args.no_maps:
        log.info("map images")
        maps_meta = soft("map images", E.region_maps, regions_geo, WEB_DATA / "maps", wy, wm, default=None)
        if maps_meta:
            (WEB_DATA / "maps.json").write_text(json.dumps(maps_meta))
    elif (WEB_DATA / "maps.json").exists():
        maps_meta = json.loads((WEB_DATA / "maps.json").read_text())

    # Farms
    farms_out = None
    if FARMS_GEOJSON.exists():
        farms = json.loads(FARMS_GEOJSON.read_text())
        if farms.get("features"):
            log.info("farms: %d", len(farms["features"]))
            fs = soft("farms", E.farm_stats, farms, wy, wm, default={})
            for f in farms["features"]:
                s = fs.get(f["properties"]["id"], {})
                f["properties"]["ndvi"] = [r(s.get(f"m{m:02d}"), 3) for m in range(1, 13)]
                f["properties"]["ndvi_normal"] = [r(s.get(f"n{m:02d}"), 3) for m in range(1, 13)]
                f["properties"]["loss_ha_since_2021"] = r(s.get("loss_ha_since_2021"), 2)
                f["properties"]["treecover2000"] = r(s.get("treecover2000"), 0)
            farms_out = farms
            (WEB_DATA / "farms.json").write_text(json.dumps(farms, separators=(",", ":")))

    shutil.copy(REGIONS_GEOJSON, WEB_DATA / "regions.geojson")
    if "district" in summaries:
        shutil.copy(DISTRICTS_GEOJSON, WEB_DATA / "districts.geojson")
    regions_now = []
    for u in summaries["region"]:
        b = u["years"].get(str(year), {})
        meta = REGIONS[u["key"]]
        regions_now.append({"key": u["key"], "name": u["name"], "capital": meta["capital"], "zone": meta["zone"],
                            "regime": meta["regime"], "rain_anom": b.get("rain_anom"), "vci": b.get("vci"),
                            "spi3": b.get("spi3"), "risk": b.get("risk", {}), "status": b.get("status")})
    (WEB_DATA / "meta.json").write_text(json.dumps({
        "sample": False, "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
        "year": year, "last_month": last_month, "rain_latest": latest.isoformat(),
        "first_year": FIRST_YEAR, "districts": "district" in summaries,
        "maps": maps_meta, "farms": bool(farms_out), "regions": regions_now,
    }, separators=(",", ":")))
    log.info("done")


if __name__ == "__main__":
    main()
