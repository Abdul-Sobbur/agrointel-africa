"""Pure-Python analysis: no Earth Engine calls here, so everything is unit-testable."""
from __future__ import annotations

import datetime as dt
import math
from typing import Iterable

import numpy as np
from scipy import stats

from .config import NORMAL_START, NORMAL_END, CROPS

DRY_DAY_MM = 1.0
NDVI_NOISE = 0.04   # combined MODIS composite noise (residual cloud, view angle), NDVI units


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


# ---------------------------------------------------------------- rainfall
def monthly_normals(monthly: dict[tuple[int, int], float], start=NORMAL_START, end=NORMAL_END) -> list[float]:
    """Mean monthly totals over the normal period."""
    out = []
    for m in range(1, 13):
        vals = [monthly[(y, m)] for y in range(start, end + 1) if (y, m) in monthly]
        out.append(float(np.mean(vals)) if vals else float("nan"))
    return out


def spi(monthly: dict[tuple[int, int], float], scale: int = 3, start=NORMAL_START, end=NORMAL_END,
        min_mean: float = 30.0) -> dict[tuple[int, int], float]:
    """Standardised Precipitation Index (McKee et al. 1993).

    Fits a gamma distribution, with a point mass at zero, to `scale`-month
    accumulations for each calendar month over the base period, then maps
    every accumulation to a standard normal value. Months whose normal
    accumulation is below `min_mean` mm (the heart of the dry season) are
    skipped, because SPI is unreliable there.
    """
    keys = sorted(monthly)
    acc: dict[tuple[int, int], float] = {}
    for i, k in enumerate(keys):
        window = keys[max(0, i - scale + 1): i + 1]
        if len(window) == scale and _consecutive(window):
            acc[k] = sum(monthly[w] for w in window)

    out: dict[tuple[int, int], float] = {}
    for m in range(1, 13):
        base = np.array([v for (y, mm), v in acc.items() if mm == m and start <= y <= end])
        if len(base) < 10 or base.mean() < min_mean:
            continue
        nonzero = base[base > 0]
        q = 1 - len(nonzero) / len(base)
        if len(nonzero) >= 5 and np.ptp(nonzero) > 0:
            a, loc, sc = stats.gamma.fit(nonzero, floc=0)
            cdf = lambda x: q + (1 - q) * stats.gamma.cdf(x, a, loc=loc, scale=sc)  # noqa: E731
        else:  # fall back to an empirical CDF when the gamma fit is impossible
            srt = np.sort(base)
            cdf = lambda x: (np.searchsorted(srt, x, side="right") + 0.5) / (len(srt) + 1)  # noqa: E731
        for (y, mm), v in acc.items():
            if mm == m:
                p = clamp(float(cdf(v)), 0.0013, 0.9987)
                out[(y, mm)] = round(float(stats.norm.ppf(p)), 2)
    return out


def _consecutive(keys: list[tuple[int, int]]) -> bool:
    for (y1, m1), (y2, m2) in zip(keys, keys[1:]):
        if (y2 * 12 + m2) - (y1 * 12 + m1) != 1:
            return False
    return True


def spi_class(v: float | None) -> str:
    if v is None or math.isnan(v):
        return "No data"
    if v >= 2: return "Extremely wet"
    if v >= 1.5: return "Very wet"
    if v >= 1: return "Moderately wet"
    if v > -1: return "Near normal"
    if v > -1.5: return "Moderately dry"
    if v > -2: return "Severely dry"
    return "Extremely dry"


def season_indicators(dates: list[dt.date], rain: list[float], regime: str) -> dict:
    """Onset, cessation, dry spells and rainy days for one year of daily rainfall.

    Onset: first day after the window opens (1 Apr in the north, 1 Mar in the
    south) with >= 20 mm over 3 days, at least 2 of them wet, and no run of 7+
    dry days in the following 30 days. Cessation: first day after 1 Sep (north)
    or 15 Oct (south) that is wet and followed by < 10 mm over the next 20 days.
    """
    if not dates:
        return {"onset": None, "cessation": None, "dry_spells": None, "rainy_days": None, "last_date": None}
    year = dates[0].year
    idx = {d: i for i, d in enumerate(dates)}
    open_day = dt.date(year, 4, 1) if regime == "uni" else dt.date(year, 3, 1)
    cess_day = dt.date(year, 9, 1) if regime == "uni" else dt.date(year, 10, 15)
    r = np.array(rain, dtype=float)
    n = len(r)

    onset = None
    for i in range(idx.get(open_day, n), n - 2):
        win = r[i:i + 3]
        if win.sum() >= 20 and (win >= DRY_DAY_MM).sum() >= 2:
            follow = r[i + 3:i + 33]
            if len(follow) < 30:
                break  # not enough data yet to confirm
            if _longest_dry_run(follow) < 7:
                onset = dates[i]
                break

    cessation = None
    for i in range(idx.get(cess_day, n), n - 20):
        if r[i] >= DRY_DAY_MM and r[i + 1:i + 21].sum() < 10:
            cessation = dates[i]
            break

    s = idx[onset] if onset else None
    e = idx[cessation] if cessation else n - 1
    dry_spells = _count_dry_runs(r[s:e + 1], 7) if s is not None else None
    return {
        "onset": onset.isoformat() if onset else None,
        "cessation": cessation.isoformat() if cessation else None,
        "dry_spells": dry_spells,
        "rainy_days": int((r >= DRY_DAY_MM).sum()),
        "last_date": dates[-1].isoformat(),
    }


def _longest_dry_run(a: Iterable[float]) -> int:
    best = cur = 0
    for v in a:
        cur = cur + 1 if v < DRY_DAY_MM else 0
        best = max(best, cur)
    return best


def _count_dry_runs(a: Iterable[float], length: int) -> int:
    count = cur = 0
    for v in list(a) + [DRY_DAY_MM]:
        if v < DRY_DAY_MM:
            cur += 1
        else:
            if cur >= length:
                count += 1
            cur = 0
    return count


def mean_doy(iso_dates: list[str | None]) -> int | None:
    days = [dt.date.fromisoformat(d).timetuple().tm_yday for d in iso_dates if d]
    return int(round(np.mean(days))) if len(days) >= 5 else None


# ---------------------------------------------------------------- trends and vegetation
def linear_trend(xs: list[float], ys: list[float]) -> tuple[float, float]:
    """Least-squares slope and intercept."""
    x, y = np.array(xs, float), np.array(ys, float)
    ok = ~np.isnan(y)
    if ok.sum() < 3:
        return float("nan"), float("nan")
    slope, icpt = np.polyfit(x[ok], y[ok], 1)
    return float(slope), float(icpt)


def vci(monthly_ndvi: dict[tuple[int, int], float], year: int, month: int) -> float | None:
    """Vegetation condition, 0-100, from a regional monthly NDVI series.

    A standardised form of Kogan's (1995) VCI: the month's departure from the
    same calendar month in all other years, in standard deviations, mapped
    through the normal CDF. 50 = typical, 84 = one SD greener, 16 = one SD
    browner. This avoids min/max bounds, which are unstable in evergreen
    forest where NDVI barely varies. The spread has a floor of NDVI_NOISE so
    departures smaller than the sensor's noise cannot read as extremes.
    """
    if (year, month) not in monthly_ndvi:
        return None
    x = monthly_ndvi[(year, month)]
    hist = np.array([v for (y, m), v in monthly_ndvi.items() if m == month and y != year and not math.isnan(v)])
    if len(hist) < 5 or hist.std() < 1e-6:
        return 50.0
    z = (x - hist.mean()) / max(hist.std(ddof=1), NDVI_NOISE)
    return round(float(100 * stats.norm.cdf(z)), 1)


# ---------------------------------------------------------------- suitability
def _trap(v: float, lo: float, hi: float, tol: float) -> float:
    if lo <= v <= hi:
        return 1.0
    d = lo - v if v < lo else v - hi
    return math.exp(-((d / tol) ** 2))


def season_rain(normal: list[float], regime: str) -> float:
    """Normal rainfall in the main growing season: May-Oct (north) or the wetter of Mar-Jul / Sep-Nov (south)."""
    if regime == "uni":
        return float(sum(normal[4:10]))
    return float(max(sum(normal[2:7]), sum(normal[8:11])))


TEXTURE = {1: "Clay", 2: "Silty clay", 3: "Sandy clay", 4: "Clay loam", 5: "Silty clay loam", 6: "Sandy clay loam",
           7: "Loam", 8: "Silt loam", 9: "Sandy loam", 10: "Silt", 11: "Loamy sand", 12: "Sand"}
HEAVY = {1, 2, 3}   # clays that are hard to work and poorly drained for root and pod crops

# Rating bands for topsoil (0-20 cm) properties: (upper limit, label) checked in order.
SOIL_BANDS = {
    "ph": [(4.5, "Extremely acid"), (5.5, "Strongly acid"), (6.5, "Moderately acid"), (7.5, "Neutral"),
           (99, "Alkaline")],
    "oc": [(6, "Very low"), (12, "Low"), (20, "Moderate"), (999, "High")],          # organic carbon, g/kg
    "n": [(0.5, "Very low"), (1.0, "Low"), (2.0, "Moderate"), (99, "High")],          # total nitrogen, g/kg
    "p": [(10, "Low"), (25, "Moderate"), (9999, "High")],                              # extractable P, ppm
    "k": [(60, "Low"), (150, "Moderate"), (9999, "High")],                             # extractable K, ppm
    "depth": [(50, "Shallow"), (100, "Moderately deep"), (999, "Deep")],               # depth to bedrock, cm
}


def soil_rating(prop: str, v: float | None) -> str | None:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    return next(lbl for top, lbl in SOIL_BANDS[prop] if v < top)


def soil_profile(raw: dict | None) -> dict | None:
    """Back-transformed iSDAsoil means for one unit → values, ratings and texture name."""
    if not raw or raw.get("ph") is None:
        return None
    out = {}
    for p in ("ph", "oc", "n", "p", "k", "depth"):
        v = raw.get(p)
        d = 2 if p == "n" else 1 if p in ("ph", "oc") else 0
        out[p] = {"value": None if v is None else round(float(v), d), "rating": soil_rating(p, v)}
    t = raw.get("texture")
    out["texture"] = {"code": int(t) if t else None, "name": TEXTURE.get(int(t)) if t else None}
    return out


def _soil_factor(c: dict, soil: dict | None) -> tuple[float, list[str]]:
    """0-1 soil fit for one crop and the reasons it falls short."""
    if not soil:
        return 1.0, []
    f, why = 1.0, []
    ph = soil["ph"]["value"]
    if ph is not None and "ph" in c:
        fp = _trap(ph, *c["ph"], 0.6)
        if fp < 0.9:
            why.append("soil too acidic" if ph < c["ph"][0] else "soil too alkaline")
        f *= fp
    dep = soil["depth"]["value"]
    if dep is not None and "depth" in c:
        fd = _trap(dep, c["depth"], 10_000, 0.4 * c["depth"])
        if fd < 0.9:
            why.append("shallow soil")
        f *= fd
    if c.get("light") and soil["texture"]["code"] in HEAVY:
        f *= 0.6
        why.append("heavy clay soil")
    return f, why


def crop_suitability(annual_rain: float, mean_temp: float, season_days: float | None, forest_zone: bool,
                     growing_rain: float | None = None, soil: dict | None = None) -> list[dict]:
    """Score 0-100 per crop from long-term climate and topsoil; classes follow FAO S1/S2/S3/N.

    Annual crops are judged on growing-season rainfall (when given), perennials on annual rainfall.
    Soil can lower a climate score by at most 30%: acidity and low fertility are usually
    correctable, so soil downgrades rather than rules out a crop.
    """
    out = []
    for c in CROPS:
        rain = growing_rain if (c["annual"] and growing_rain is not None) else annual_rain
        rs = _trap(rain, *c["rain"], 0.3 * (c["rain"][1] - c["rain"][0]) + 120)
        ts = _trap(mean_temp, *c["temp"], 2.2)
        ls = 1.0 if season_days is None else _trap(season_days, c["los"], 400, 30)
        wet = _trap(annual_rain, 0, c["max_annual"], 250) if c.get("max_annual") else 1.0  # too wet a climate
        climate = 100 * rs * ts * ls * wet * (0.32 if c.get("forest") and not forest_zone else 1.0)
        sf, why = _soil_factor(c, soil)
        score = climate * (0.7 + 0.3 * sf)
        # tie-breaker: how close the climate sits to the middle of the crop's optimal ranges (1 = centre)
        centre = 1 - 0.5 * (abs(rain - sum(c["rain"]) / 2) / ((c["rain"][1] - c["rain"][0]) / 2)
                            + abs(mean_temp - sum(c["temp"]) / 2) / ((c["temp"][1] - c["temp"][0]) / 2))
        item = {"key": c["key"], "name": c["name"], "score": round(score), "class": suit_class(score),
                "fit": round(centre + 0.2 * sf, 3), "climate": round(climate)}
        if soil:
            item["soil"] = round(sf, 2)
            item["limits"] = why
        out.append(item)
    return sorted(out, key=lambda d: (-d["score"], -d["fit"]))


def suit_class(s: float) -> str:
    return "S1" if s >= 80 else "S2" if s >= 60 else "S3" if s >= 40 else "N"


# ---------------------------------------------------------------- risk
def risk_scores(*, spi3_latest: float | None, season_anom_pct: float, dry_spells: int | None,
                spi3_recent_max: float | None, water_pct: float | None, ndvi_trend_decade: float,
                vci_latest: float | None) -> dict:
    """Transparent 0-100 heuristic indices. Higher = more risk."""
    s = 0.0 if spi3_latest is None else spi3_latest
    ds = 2 if dry_spells is None else dry_spells
    drought = clamp(45 - 18 * s - 0.4 * season_anom_pct + 5 * (ds - 2), 2, 98)
    wet = 0.0 if spi3_recent_max is None else max(0.0, spi3_recent_max)
    flood = clamp(15 + 18 * wet + 0.6 * max(0.0, (water_pct or 100) - 100), 2, 98)
    degradation = clamp(45 - ndvi_trend_decade * 600, 2, 98)
    v = 50 if vci_latest is None else vci_latest
    production = clamp(0.5 * drought + 0.2 * flood + 0.3 * (100 - v), 2, 98)
    composite = 0.35 * drought + 0.2 * flood + 0.2 * degradation + 0.25 * production
    return {k: round(val) for k, val in
            dict(drought=drought, flood=flood, degradation=degradation, production=production, composite=composite).items()}


def season_status(anom_pct: float, vci_latest: float | None, spi3_latest: float | None, extra_dry_spells: float) -> str:
    """Favourable / Watch / Stressed from rainfall, recent drought and vegetation condition."""
    v = 50 if vci_latest is None else vci_latest
    s = 0.0 if spi3_latest is None else spi3_latest
    score = 0.4 * anom_pct + 0.5 * (v - 50) + 12 * min(0.0, s) - 3 * max(0.0, extra_dry_spells)
    return "Favourable" if score >= -8 else "Watch" if score >= -20 else "Stressed"


# ---------------------------------------------------------------- reservoirs
def reservoir_stats(series: dict[str, float], base: tuple[int, int]) -> dict | None:
    """Latest surface area against the usual area for that calendar month and a 'full' reference.

    series: {"YYYY-MM": km2}. 'Full' is the 95th percentile of all monthly areas, which is
    steadier than the single largest month (often a flood or a radar artefact).
    """
    pts = sorted((k, v) for k, v in series.items() if v is not None)
    if not pts:
        return None
    ym, area = pts[-1]
    m = int(ym[5:7])
    same = [v for k, v in pts if int(k[5:7]) == m and base[0] <= int(k[:4]) <= base[1]]
    normal = float(np.mean(same)) if len(same) >= 3 else None
    full = float(np.percentile([v for _, v in pts], 95))
    pct_normal = area / normal * 100 if normal else None
    status = (None if pct_normal is None else "Well below usual" if pct_normal < 70
              else "Below usual" if pct_normal < 90 else "Above usual" if pct_normal > 115 else "Near usual")
    monthly_normal = []
    for mm in range(1, 13):
        vals = [v for k, v in pts if int(k[5:7]) == mm and base[0] <= int(k[:4]) <= base[1]]
        monthly_normal.append(round(float(np.mean(vals)), 2) if len(vals) >= 3 else None)
    years = {}
    for k, v in pts:
        years.setdefault(k[:4], []).append(v)
    return {"latest_month": ym, "area_km2": round(area, 2), "normal_km2": None if normal is None else round(normal, 2),
            "pct_normal": None if pct_normal is None else round(pct_normal), "full_km2": round(full, 2),
            "fill_pct": round(min(area / full, 1.2) * 100) if full else None, "status": status,
            "monthly_normal": monthly_normal,
            "annual": {y: {"min": round(min(v), 2), "max": round(max(v), 2), "n": len(v)} for y, v in years.items()}}
