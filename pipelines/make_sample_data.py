"""Generate clearly-labelled SAMPLE data by running the real pipeline against a fake Earth Engine.

This exercises every step of run_pipeline.py offline (useful for tests and for
previewing the website before Earth Engine credentials are set up). The output
is marked "sample": true and the website shows a banner saying so.

    python pipelines/make_sample_data.py
"""
from __future__ import annotations

import calendar
import datetime as dt
import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

import zlib

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_pipeline as RP  # noqa: E402
from agrointel.config import REGIONS, WEB_DATA  # noqa: E402

UNI = [0.3, 0.8, 2.6, 6, 10, 12, 14, 18, 17, 8, 1.2, 0.3]
BI = [1.5, 3.5, 8, 11, 14, 17, 7, 5, 10, 12, 6, 2.5]
ANNUAL = {"ahafo": 1350, "ashanti": 1450, "bono": 1250, "bono-east": 1250, "central": 1300, "eastern": 1480,
          "greater-accra": 800, "north-east": 1000, "northern": 1080, "oti": 1300, "savannah": 1130,
          "upper-east": 960, "upper-west": 1000, "volta": 1250, "western": 1800, "western-north": 1600}
TEMP = {"upper-east": 29.0, "upper-west": 28.6, "north-east": 28.6, "northern": 28.3, "savannah": 27.9,
        "oti": 27.4, "bono-east": 26.9, "greater-accra": 27.6}
NDVI = {"upper-east": 0.36, "upper-west": 0.42, "north-east": 0.4, "northern": 0.45, "savannah": 0.5,
        "greater-accra": 0.32, "oti": 0.52, "bono-east": 0.58, "volta": 0.55}


def _rng(*parts):
    return np.random.default_rng(zlib.crc32("|".join(map(str, parts)).encode()))


def _year_factor(k, y):
    return 1 + (_rng(k, y, "yf").random() - 0.5) * 0.44


def _units(fc):
    """(unit key, region key) for every feature of a region or district collection."""
    return [(f["properties"]["key"], f["properties"].get("region", f["properties"]["key"])) for f in fc["features"]]


def _monthly(k, y, m, reg=None):
    reg = reg or k
    shape = UNI if REGIONS[reg]["regime"] == "uni" else BI
    base = ANNUAL[reg] * shape[m - 1] / sum(shape) * (0.9 + 0.2 * _rng(k, "scale").random())
    return max(0.0, base * (_year_factor(reg, y) + (_rng(k, y, m).random() - 0.5) * 0.6))


class FakeEarth(SimpleNamespace):
    def __init__(self, keys, today):
        super().__init__()
        self.keys, self.today = keys, today

    def init(self):
        pass

    def feature_collection(self, geo, id_prop="key"):
        return geo

    def chirps_latest_date(self):
        return dt.date(self.today.year, self.today.month, 1) - dt.timedelta(days=39)

    def chirps_monthly_year(self, fc, y, lm=12):
        return {k: {f"m{m:02d}": _monthly(k, y, m, g) for m in range(1, lm + 1)} for k, g in _units(fc)}

    def chirps_daily_year(self, fc, y, until=None):
        last = until or dt.date(y, 12, 31)
        dates = [dt.date(y, 1, 1) + dt.timedelta(days=i) for i in range((last - dt.date(y, 1, 1)).days + 1)]
        months = np.array([d.month for d in dates])
        dim = np.array([calendar.monthrange(y, m)[1] for m in range(1, 13)])
        out = {}
        for k, g in _units(fc):
            mm = np.array([_monthly(k, y, m, g) for m in range(1, 13)])
            daily_mean = (mm / dim)[months - 1]
            p_wet = np.minimum(0.85, daily_mean / 6 + 0.02)
            u = _rng(k, y, "daily").random((2, len(dates)))
            out[k] = np.where(u[0] < p_wet, daily_mean / p_wet * (0.4 + u[1]), 0.0).round(2).tolist()
        return dates, out

    def ndvi_monthly_year(self, fc, y):
        res = {}
        for k, g in _units(fc):
            base = NDVI.get(g, 0.68) * (0.95 + 0.1 * _rng(k, "nd").random())
            amp = 0.6 if REGIONS[g]["regime"] == "uni" else 0.3
            shape = UNI if REGIONS[g]["regime"] == "uni" else BI
            row = {}
            for m in range(1, 13):
                if dt.date(y, m, 1) >= dt.date(self.today.year, self.today.month, 1):
                    continue
                lag = 0.6 * shape[(m - 2) % 12] + 0.4 * shape[m - 1]
                v = base * (1 - amp + amp * lag / max(shape)) + 0.06
                v *= 1 + (_year_factor(g, y) - 1) * 0.4 + 0.002 * (y - 2001) * (-1 if g in ("upper-east", "western") else 1)
                row[f"m{m:02d}"] = round(v + (_rng(k, y, m, "n").random() - 0.5) * 0.03, 4)
            res[k] = row
        return res

    def ndvi_crop_monthly_year(self, fc, y):
        """Farmland greens up later and browns sooner than the surrounding land."""
        res = self.ndvi_monthly_year(fc, y)
        for k, row in res.items():
            for m in row:
                row[m] = round(row[m] * (0.93 + 0.04 * _rng(k, "cropshift").random()), 4)
        return res

    def land_cover(self, fc):
        out = {}
        for k, g in _units(fc):
            north = REGIONS[g]["regime"] == "uni"
            u = _rng(k, "lc").random(4)
            area = 800 + 4000 * u[0]
            shares = {10: (0.2 if north else 0.62) + 0.1 * u[1], 20: 0.12, 30: (0.3 if north else 0.08),
                      40: (0.28 if north else 0.07) + 0.1 * u[2], 50: 0.02 + (0.3 if g == "greater-accra" else 0.01),
                      60: 0.005, 80: 0.01 + 0.03 * u[3], 90: 0.004, 95: 0.0 if g not in ("volta", "western") else 0.002}
            tot = sum(shares.values())
            out[k] = {f"c{c}": area * v / tot for c, v in shares.items()}
        return out

    def soil_stats(self, fc):
        out = {}
        for k, g in _units(fc):
            north = REGIONS[g]["regime"] == "uni"
            u = _rng(k, "soil").random(7)
            out[k] = {"ph": (6.0 if north else 5.3) + 0.6 * (u[0] - 0.5), "oc": (7 if north else 14) + 6 * u[1],
                      "n": (0.6 if north else 1.1) + 0.5 * u[2], "p": 4 + 14 * u[3], "k": 60 + 140 * u[4],
                      "depth": 60 + 120 * u[5], "texture": 9 if north else (6 if u[6] < 0.6 else 4)}
        return out

    def era5_annual_temps(self, fc, first, last):
        res = {}
        for k, g in _units(fc):
            t0 = TEMP.get(g, 26.4)
            row = {f"y{y}": t0 - 0.45 + 0.031 * (y - 1996) + (_rng(k, y, "t").random() - 0.5) * 0.5 for y in range(first, last + 1)}
            row["normal"] = t0
            res[k] = row
        return res

    def pet_monthly(self, fc, y):
        uni = [175, 185, 195, 180, 160, 135, 118, 108, 112, 130, 152, 168]
        bi = [128, 138, 148, 140, 128, 108, 98, 96, 104, 118, 124, 124]
        return {k: {f"m{m:02d}": (uni if REGIONS[g]["regime"] == "uni" else bi)[m - 1] for m in range(1, 13)}
                for k, g in _units(fc)}

    def water_areas(self, fc, y, m):
        out = {}
        for k, g in _units(fc):
            base = 40 + 400 * _rng(k, "w").random()
            row = {f"b{yy}": base * (0.9 + 0.2 * _rng(k, yy).random()) for yy in range(2017, 2022)}
            row["current"] = base * _year_factor(g, y)
            row["permanent"] = base * 0.7
            out[k] = row
        return out

    def region_maps(self, geo, out_dir, y, m):
        return None

    def farm_stats(self, farms, y, lm):
        out = {}
        for f in farms["features"]:
            fid = f["properties"]["id"]
            k = f["properties"]["region"]
            one = {"features": [{"properties": {"key": k}}]}
            row = self.ndvi_monthly_year(one, y)[k]
            norm = self.ndvi_monthly_year(one, 2022)[k]
            s = {}
            for m in range(1, 13):
                if f"m{m:02d}" in row and m <= lm:
                    s[f"m{m:02d}"] = row[f"m{m:02d}"] * 1.08
                s[f"n{m:02d}"] = norm.get(f"m{m:02d}", 0.5) * 1.05
            s["loss_ha_since_2021"] = 0.0
            s["treecover2000"] = 62 if k == "ashanti" else 8
            out[fid] = s
        return out


def main():
    geo = json.loads(RP.REGIONS_GEOJSON.read_text())
    keys = [f["properties"]["key"] for f in geo["features"]]
    RP.E = FakeEarth(keys, dt.date.today())
    with tempfile.TemporaryDirectory() as tmp:
        RP.CACHE_DIR = Path(tmp)
        sys.argv = ["run_pipeline.py", "--no-maps"]
        RP.main()
    meta_p = WEB_DATA / "meta.json"
    meta = json.loads(meta_p.read_text())
    meta["sample"] = True
    meta_p.write_text(json.dumps(meta, separators=(",", ":")))
    print("Sample data written to", WEB_DATA)


if __name__ == "__main__":
    main()
