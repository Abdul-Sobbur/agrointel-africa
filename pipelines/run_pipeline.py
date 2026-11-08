"""Run the AgroIntel Africa pipeline: Earth Engine → JSON + PNG files for the website.

Usage:
    python pipelines/run_pipeline.py              # normal weekly run
    python pipelines/run_pipeline.py --no-maps    # skip map images (faster)
    python pipelines/run_pipeline.py --rebuild    # ignore cached history

Historical series are cached in data/cache/ so routine runs only fetch the
current and previous year.
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
from agrointel.config import (CACHE_DIR, FARMS_GEOJSON, NDVI_BASE_START, NORMAL_END, NORMAL_START,  # noqa: E402
                              REGIONS, REGIONS_GEOJSON, SEASON_BASE, TEMP_TREND_START, WEB_DATA)

log = logging.getLogger("agrointel")


# ---------------------------------------------------------------- cache helpers
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


# ---------------------------------------------------------------- stages
def update_monthly(fc, keys, cache_name, fetch, first_year, year, last_month, rebuild):
    """Fill a {region: {"YYYY-MM": value}} cache, always refreshing the last two years."""
    cache = {} if rebuild else load(cache_name)
    have = {ym[:4] for k in cache.values() for ym in k}
    for y in range(first_year, year + 1):
        if str(y) in have and y < year - 1:
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
    return cache


def as_tuple_series(d: dict) -> dict[tuple[int, int], float]:
    return {(int(k[:4]), int(k[5:7])): v for k, v in d.items()}


def update_season_history(fc, keys, rebuild):
    cache = {} if rebuild else load("season_history_sat.json")
    for y in range(SEASON_BASE[0], SEASON_BASE[1] + 1):
        if all(str(y) in cache.get(k, {}) for k in keys):
            continue
        dates, daily = soft(f"season history {y}", E.chirps_daily_year, fc, y, default=([], {}))
        log.info("season history %s: %d days", y, len(dates))
        if not dates:
            continue
        for k in keys:
            ind = A.season_indicators(dates, daily[k], REGIONS[k]["regime"])
            ind["total"] = round(sum(daily[k]), 1)
            cache.setdefault(k, {})[str(y)] = ind
        save("season_history_sat.json", cache)
    return cache


# ---------------------------------------------------------------- main
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-maps", action="store_true")
    ap.add_argument("--rebuild", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    E.init()
    geo = json.loads(REGIONS_GEOJSON.read_text())
    keys = [f["properties"]["key"] for f in geo["features"]]
    names = {f["properties"]["key"]: f["properties"]["name"] for f in geo["features"]}
    fc = E.feature_collection(geo)

    latest = E.chirps_latest_date()
    year = latest.year
    last_day = calendar.monthrange(year, latest.month)[1]
    last_month = latest.month if latest.day == last_day else latest.month - 1
    if last_month < 1:  # very early in a year: report the previous full year
        year, last_month = year - 1, 12
    log.info("CHIRPS data to %s → reporting %s, months 1-%s", latest, year, last_month)

    # Rainfall history and current year
    rain = update_monthly(fc, keys, "chirps_monthly.json", E.chirps_monthly_year, NORMAL_START, year, last_month, args.rebuild)
    seasons_hist = update_season_history(fc, keys, args.rebuild)
    dates, daily = soft("daily rainfall", E.chirps_daily_year, fc, year, latest, default=([], {}))
    log.info("daily rainfall %s: %d days", year, len(dates))

    # Vegetation history
    t0 = dt.date.today()
    ny_, nm_ = (t0.year, t0.month - 1) if t0.month > 1 else (t0.year - 1, 12)  # only complete months
    ndvi = update_monthly(fc, keys, "ndvi_monthly_qa.json", E.ndvi_monthly_year, NDVI_BASE_START, ny_, nm_, args.rebuild)

    # Temperature, evapotranspiration, water
    log.info("temperature")
    temps = soft("temperature", E.era5_annual_temps, fc, TEMP_TREND_START, year, default={})
    pet_norm = load("pet_normal.json")
    if not pet_norm or args.rebuild:
        log.info("PET normal")
        pet_norm = soft("PET normal", E.pet_monthly, fc, None, default={})
        if pet_norm:
            save("pet_normal.json", pet_norm)
    log.info("PET %s", year)
    pet_now = soft("PET", E.pet_monthly, fc, year, default={})

    today = dt.date.today()
    wy, wm = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)
    log.info("water %s-%02d", wy, wm)
    water = soft("water", E.water_areas, fc, wy, wm, default={})

    # Maps
    maps_meta = None
    if not args.no_maps:
        log.info("map images")
        maps_meta = soft("map images", E.region_maps, geo, WEB_DATA / "maps", wy, wm, default=None)
        if maps_meta:
            (WEB_DATA / "maps.json").write_text(json.dumps(maps_meta))
    elif (WEB_DATA / "maps.json").exists():
        maps_meta = json.loads((WEB_DATA / "maps.json").read_text())

    # ------------------------------------------------------------ assemble per region
    out_dir = WEB_DATA / "regions"
    out_dir.mkdir(parents=True, exist_ok=True)
    summary = []
    for k in keys:
        meta = REGIONS[k]
        ser = as_tuple_series(rain.get(k, {}))
        normal = A.monthly_normals(ser)
        monthly = [ser.get((year, m)) for m in range(1, last_month + 1)]
        tot, ntot = sum(v or 0 for v in monthly), sum(normal[:last_month])
        anom = (tot / ntot - 1) * 100 if ntot else 0.0
        month_anom = [r((v / n - 1) * 100 if n else None, 0) if v is not None and n >= 1 else None
                      for v, n in zip(monthly, normal)]
        spi_all = A.spi(ser, 3)
        spi_year = [spi_all.get((year, m)) for m in range(1, 13)]
        spi_latest = spi_year[last_month - 1]

        # season indicators
        cur = A.season_indicators(dates, daily.get(k, []), meta["regime"])
        hist = seasons_hist.get(k, {})
        onset_n = A.mean_doy([h.get("onset") for h in hist.values()])
        cess_n = A.mean_doy([h.get("cessation") for h in hist.values()])
        rd_n = round(sum(h["rainy_days"] for h in hist.values()) / len(hist)) if hist else None
        ds_n = round(sum(h["dry_spells"] or 0 for h in hist.values()) / len(hist), 1) if hist else None
        doy = lambda s: dt.date.fromisoformat(s).timetuple().tm_yday if s else None  # noqa: E731
        los = (doy(cur["cessation"]) - doy(cur["onset"])) if cur["onset"] and cur["cessation"] else None
        los_n = (cess_n - onset_n) if onset_n and cess_n else None

        # temperature
        trow = temps.get(k, {})
        tyears = list(range(TEMP_TREND_START, year + 1))
        tvals = [trow.get(f"y{y}") for y in tyears]
        slope, _ = A.linear_trend(tyears, [v if v is not None else float("nan") for v in tvals])

        # vegetation
        nser = as_tuple_series(ndvi.get(k, {}))
        nnorm = [None if math.isnan(x) else x for x in A.monthly_normals(nser, NDVI_BASE_START, NORMAL_END)]
        ny = max((y for (y, m) in nser), default=year)
        ncur = [nser.get((ny, m)) for m in range(1, 13)]
        nlm = max((m for m in range(1, 13) if ncur[m - 1] is not None), default=None)
        vci = A.vci(nser, ny, nlm) if nlm else None
        ann = {}
        for (y, m), v in nser.items():
            if y < ny:
                ann.setdefault(y, []).append(v)
        ay = sorted(y for y, v in ann.items() if len(v) == 12)
        nslope, _ = A.linear_trend(ay, [sum(ann[y]) / 12 for y in ay])

        # water balance
        pn, pc = pet_norm.get(k, {}), pet_now.get(k, {})
        pet = [pc.get(f"m{m:02d}") if pc.get(f"m{m:02d}") is not None else pn.get(f"m{m:02d}") for m in range(1, 13)]
        p_used = [monthly[m - 1] if m <= last_month else normal[m - 1] for m in range(1, 13)]
        balance = [r((p or 0) - (e or 0), 0) for p, e in zip(p_used, pet)]
        aridity = sum(p_used) / sum(e or 0 for e in pet) if any(pet) else None

        w = water.get(k, {})
        base = [w.get(f"b{y}") for y in range(2017, 2022) if w.get(f"b{y}") is not None]
        wnorm = sum(base) / len(base) if base else None
        wpct = (w.get("current") or 0) / wnorm * 100 if wnorm and wnorm > 0.5 else None

        # suitability and risk
        tnorm = trow.get("normal") or (sum(v for v in tvals if v) / max(1, len([v for v in tvals if v])))
        suit = A.crop_suitability(sum(normal), tnorm, los_n, meta["forest"], A.season_rain(normal, meta["regime"]))
        recent = [v for v in spi_year[max(0, last_month - 3):last_month] if v is not None]
        risk = A.risk_scores(spi3_latest=spi_latest, season_anom_pct=anom, dry_spells=cur["dry_spells"],
                             spi3_recent_max=max(recent) if recent else None, water_pct=wpct,
                             ndvi_trend_decade=(nslope * 10 if not math.isnan(nslope) else 0.0), vci_latest=vci)
        status = A.season_status(anom, vci, spi_latest, (cur["dry_spells"] or 0) - (ds_n or 0))

        region = {
            "key": k, "name": names[k], **meta, "year": year, "updated": today.isoformat(),
            "rain": {"last_month": last_month, "latest_date": latest.isoformat(),
                     "monthly": [r(v) for v in monthly], "normal": [r(v) for v in normal],
                     "total": r(tot, 0), "normal_to_date": r(ntot, 0), "anomaly_pct": r(anom, 1),
                     "monthly_anom": month_anom, "spi3": [r(v, 2) for v in spi_year],
                     "spi3_latest": r(spi_latest, 2), "spi_class": A.spi_class(spi_latest),
                     "annual_normal": r(sum(normal), 0)},
            "season": {**cur, "onset_normal_doy": onset_n, "cessation_normal_doy": cess_n, "los": los, "los_normal": los_n,
                       "rainy_days_normal": rd_n, "dry_spells_normal": ds_n},
            "temp": {"years": tyears, "annual": [r(v, 2) for v in tvals], "trend_decade": r(slope * 10, 2),
                     "normal": r(tnorm, 2)},
            "ndvi": {"year": ny, "monthly": [r(v, 3) for v in ncur], "normal": [r(v, 3) for v in nnorm],
                     "latest_month": nlm, "vci": vci, "trend_decade": r(nslope * 10, 3) if not math.isnan(nslope) else None},
            "water": {"month": f"{wy}-{wm:02d}", "current_km2": r(w.get("current"), 1), "normal_km2": r(wnorm, 1),
                      "pct": r(wpct, 0), "permanent_km2": r(w.get("permanent"), 1)},
            "balance": {"p": [r(v, 0) for v in p_used], "pet": [r(v, 0) for v in pet], "balance": balance,
                        "projected": [m > last_month for m in range(1, 13)], "aridity": r(aridity, 2),
                        "deficit_months": sum(1 for b in balance if b is not None and b < -40)},
            "suitability": suit, "risk": risk, "status": status,
        }
        (out_dir / f"{k}.json").write_text(json.dumps(region, separators=(",", ":")))
        summary.append({"key": k, "name": names[k], "capital": meta["capital"], "zone": meta["zone"],
                        "regime": meta["regime"], "rain_anom": region["rain"]["anomaly_pct"], "vci": vci,
                        "spi3": region["rain"]["spi3_latest"], "risk": risk, "status": status,
                        "top_crop": suit[0]["name"]})
        log.info("%s: rain %+.0f%%, VCI %s, risk %s", k, anom, vci, risk["composite"])

    # ------------------------------------------------------------ farms
    farms_out = None
    if FARMS_GEOJSON.exists():
        farms = json.loads(FARMS_GEOJSON.read_text())
        if farms.get("features"):
            log.info("farms: %d", len(farms["features"]))
            fy, fm = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)
            fs = soft("farms", E.farm_stats, farms, fy, fm, default={})
            for f in farms["features"]:
                s = fs.get(f["properties"]["id"], {})
                f["properties"]["ndvi"] = [r(s.get(f"m{m:02d}"), 3) for m in range(1, 13)]
                f["properties"]["ndvi_normal"] = [r(s.get(f"n{m:02d}"), 3) for m in range(1, 13)]
                f["properties"]["loss_ha_2021_2023"] = r(s.get("loss_ha_2021"), 2)
                f["properties"]["treecover2000"] = r(s.get("treecover2000"), 0)
            farms_out = farms
            (WEB_DATA / "farms.json").write_text(json.dumps(farms, separators=(",", ":")))

    shutil.copy(REGIONS_GEOJSON, WEB_DATA / "regions.geojson")
    (WEB_DATA / "meta.json").write_text(json.dumps({
        "sample": False, "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
        "year": year, "last_month": last_month, "rain_latest": latest.isoformat(),
        "maps": maps_meta, "farms": bool(farms_out), "regions": summary,
    }, separators=(",", ":")))
    log.info("done: %d regions written", len(summary))


if __name__ == "__main__":
    main()
