import datetime as dt
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agrointel import analysis as A  # noqa: E402


def _series(seed=1, years=range(1991, 2027)):
    rng = np.random.default_rng(seed)
    shape = [5, 20, 60, 100, 130, 160, 180, 220, 210, 90, 15, 5]
    return {(y, m): float(max(0, shape[m - 1] * rng.gamma(4, 0.25))) for y in years for m in range(1, 13)}


def test_monthly_normals_mean():
    s = {(y, 1): float(y - 1990) for y in range(1991, 2021)}
    assert A.monthly_normals(s)[0] == np.mean(range(1, 31))


def test_spi_is_standardised_over_base_period():
    s = _series()
    out = A.spi(s, 3)
    base = [v for (y, m), v in out.items() if 1991 <= y <= 2020 and m == 8]
    assert abs(np.mean(base)) < 0.35
    assert 0.7 < np.std(base) < 1.3


def test_spi_detects_drought():
    s = _series()
    for m in (6, 7, 8):
        s[(2026, m)] = 0.2 * s[(2026, m)]
    assert A.spi(s, 3)[(2026, 8)] < -1.5


def test_spi_requires_consecutive_months():
    s = _series()
    del s[(2000, 5)]
    assert (2000, 6) not in A.spi(s, 3)


def test_season_onset_and_dry_spells():
    year = 2026
    dates = [dt.date(year, 1, 1) + dt.timedelta(days=i) for i in range(365)]
    rain = [0.0] * 365
    start = dt.date(year, 5, 10).timetuple().tm_yday - 1
    for i in range(start, start + 140):
        rain[i] = 10.0 if (i - start) % 2 == 0 else 0.0
    for i in range(start + 60, start + 70):  # a 10-day dry spell mid-season
        rain[i] = 0.0
    ind = A.season_indicators(dates, rain, "uni")
    assert ind["onset"] == "2026-05-10"
    assert ind["dry_spells"] == 1
    assert ind["cessation"] is not None


def test_onset_rejected_when_followed_by_long_dry_spell():
    year = 2026
    dates = [dt.date(year, 1, 1) + dt.timedelta(days=i) for i in range(365)]
    rain = [0.0] * 365
    false_start = dt.date(year, 4, 5).timetuple().tm_yday - 1
    rain[false_start:false_start + 3] = [10, 10, 5]
    real = dt.date(year, 5, 20).timetuple().tm_yday - 1
    for i in range(real, real + 120):
        rain[i] = 8.0
    assert A.season_indicators(dates, rain, "uni")["onset"] == "2026-05-20"


def test_linear_trend():
    slope, icpt = A.linear_trend([0, 1, 2, 3], [1, 3, 5, 7])
    assert math.isclose(slope, 2) and math.isclose(icpt, 1)


def test_vci_bounds():
    s = {(y, 7): 0.3 + 0.01 * (y - 2001) for y in range(2001, 2027)}
    assert A.vci(s, 2026, 7) == 100.0
    assert A.vci(s, 2001, 7) == 0.0


def test_crop_suitability_north_favours_cereals():
    north = {c["key"]: c["score"] for c in A.crop_suitability(1000, 28.8, 150, False, 850)}
    assert north["sorghum"] > north["cocoa"] and north["maize"] >= 60
    south = {c["key"]: c["score"] for c in A.crop_suitability(1470, 26.2, 254, True, 760)}
    assert south["cocoa"] >= 80 and south["maize"] >= 80


def test_season_rain_regimes():
    north = [3, 10, 31, 73, 123, 137, 160, 209, 211, 90, 14, 4]
    assert A.season_rain(north, "uni") == sum(north[4:10])
    south = [20, 50, 120, 150, 180, 220, 110, 70, 150, 160, 70, 25]
    assert A.season_rain(south, "bi") == sum(south[2:7])


def test_flood_rises_with_wet_spell_and_water():
    base = dict(spi3_latest=0, season_anom_pct=0, dry_spells=2, ndvi_trend_decade=0, vci_latest=50)
    assert A.risk_scores(spi3_recent_max=2.0, water_pct=130, **base)["flood"] > A.risk_scores(spi3_recent_max=0.2, water_pct=100, **base)["flood"]


def test_season_status_flags_drought():
    assert A.season_status(15, 40, -2.0, 0) != "Favourable"
    assert A.season_status(5, 60, 0.3, 0) == "Favourable"


def test_risk_scores_rise_with_drought():
    calm = A.risk_scores(spi3_latest=0.5, season_anom_pct=5, dry_spells=1, spi3_recent_max=0.3,
                         water_pct=100, ndvi_trend_decade=0.01, vci_latest=60)
    dry = A.risk_scores(spi3_latest=-2, season_anom_pct=-30, dry_spells=4, spi3_recent_max=-1.5,
                        water_pct=70, ndvi_trend_decade=-0.02, vci_latest=20)
    assert dry["drought"] > calm["drought"] and dry["composite"] > calm["composite"]
    assert all(2 <= v <= 98 for v in dry.values())
