/* AgroIntel Africa web app: reads JSON written by pipelines/run_pipeline.py. */
(() => {
'use strict';
const REPO = 'https://github.com/Abdul-Sobbur/agrointel-africa';
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isNum = v => typeof v === 'number' && !Number.isNaN(v);
const fx = (v, d = 0) => isNum(v) ? Number(v).toFixed(d) : '–';
const sgn = (v, d = 0) => isNum(v) ? (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) : '–';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = iso => { if (!iso) return '–'; const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const fmtDay = iso => { if (!iso) return '–'; const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const doyStr = doy => { if (!isNum(doy)) return '–'; const d = new Date(Date.UTC(2021, 0, doy)); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const doyOf = iso => { const d = new Date(iso + 'T00:00:00Z'); return Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5); };
const store = { get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (e) { return f; } },
                set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } } };

/* ---------------- data ---------------- */
const D = { meta: null, geo: null, dgeo: null, farms: null, units: {}, sum: { region: null, district: null } };
async function getJSON(p) { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); }
async function unitData(level, k) { const id = level + ':' + k; if (!D.units[id]) D.units[id] = await getJSON(`data/${level}s/${k}.json`); return D.units[id]; }
const summary = k => D.meta.regions.find(r => r.key === k);                 // current year, regions (landing page)
const sumUnit = (level, k) => ((D.sum[level] || { units: [] }).units).find(u => u.key === k);
const sumYear = (level, k, y) => { const u = sumUnit(level, k); return u ? u.years[String(y)] : null; };
const curLevel = () => state.district ? 'district' : 'region';
const curKey = () => state.district || state.region;
const isCurrentYear = () => Number(state.year) === Number(D.meta.year);

/* Shape one season of a unit's file into the object the views read. */
function asView(U, y) {
  const b = U.years[String(y)]; if (!b) return null;
  const cur = Number(y) === Number(U.current_year), sn = U.season_normal || {};
  return { key: U.key, name: U.name, level: U.level, region: U.region, zone: U.zone, regime: U.regime, year: Number(y), isCurrent: cur,
    rain: { ...b.rain, normal: U.rain_normal, annual_normal: U.annual_normal, spi3_latest: b.rain.spi3_ref, latest_date: cur ? U.latest_date : `${y}-12-31` },
    season: { ...b.season, onset_normal_doy: sn.onset_doy, cessation_normal_doy: sn.cessation_doy, los_normal: sn.los, rainy_days_normal: sn.rainy_days, dry_spells_normal: sn.dry_spells },
    temp: U.temp, ndvi: { year: Number(y), ...b.ndvi, normal: U.ndvi_normal, trend_decade: U.ndvi_trend_decade },
    water: U.water, change: U.change, balance: b.balance, suitability: U.suitability, soil: U.soil, land: U.land, ndviBasis: U.ndvi_basis, risk: b.risk, status: b.status };
}

/* ---------------- state ---------------- */
let state = Object.assign({ region: 'northern', district: null, year: null, level: 'region', ind: 'risk', sub: { crop: 'health', climate: 'rain', water: 'surface', risk: 'summary', farms: 'trace' }, farm: null },
  store.get('agrointel.state', {}));
const save = () => store.set('agrointel.state', { region: state.region, district: state.district, year: state.year, level: state.level, ind: state.ind, sub: state.sub, farm: state.farm, res: state.res });

/* ---------------- classes ---------------- */
const level = v => !isNum(v) ? ['No data', 'neu'] : v < 30 ? ['Low', 'good'] : v < 50 ? ['Moderate', 'mod'] : v < 70 ? ['High', 'warn'] : ['Very high', 'bad'];
const vciClass = v => !isNum(v) ? ['No data', 'neu'] : v >= 60 ? ['Above normal', 'good'] : v >= 40 ? ['Near normal', 'mod'] : v >= 25 ? ['Below normal', 'warn'] : ['Poor', 'bad'];
const spiCls = v => !isNum(v) ? 'neu' : v >= 1.5 ? 'neu' : v > -1 ? 'good' : v > -1.5 ? 'warn' : 'bad';
const statusCls = s => s === 'Favourable' ? 'good' : s === 'Watch' ? 'warn' : 'bad';
const suitName = c => ({ S1: 'Highly suitable', S2: 'Moderately suitable', S3: 'Marginally suitable', N: 'Not suitable' }[c]);
const suitCol = c => ({ S1: 'good', S2: 'mod', S3: 'warn', N: 'bad' }[c]);
const COLOR = { good: '#0E7A44', mod: '#C9A227', warn: '#E07B12', bad: '#C2302A', neu: '#2C6FB5' };

/* ---------------- small UI parts ---------------- */
const chip = (t, c) => `<span class="chip ${c}">${esc(t)}</span>`;
const fact = (k, v, s) => `<div class="fact"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
const verdict = (c, t, p) => `<div class="verdict">${c || ''}<h2>${t}</h2>${p ? `<p>${p}</p>` : ''}</div>`;
const meter = (v, col) => `<div class="meter"><span style="width:${clamp(v || 0, 0, 100)}%;background:var(--${col})"></span></div>`;
const P = inner => `<section class="panel">${inner}</section>`;
const svg = (W, H, s, label) => `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${s}</svg>`;
function niceMax(v) { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }

function barsCompare(normal, actual) {
  const W = 360, H = 200, L = 36, R = 6, T = 12, B = 22, iw = W - L - R, ih = H - T - B;
  const mx = niceMax(Math.max(...normal.filter(isNum), ...actual.filter(isNum))), band = iw / 12; let s = '';
  for (let k = 0; k <= 2; k++) { const v = mx * k / 2, y = T + ih - ih * k / 2; s += `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="ax" x="${L - 5}" y="${y + 3}" text-anchor="end">${Math.round(v)}</text>`; }
  normal.forEach((n, i) => { const x = L + band * i, hN = ih * (n || 0) / mx;
    s += `<rect class="m-normal" x="${(x + band * .1).toFixed(1)}" y="${(T + ih - hN).toFixed(1)}" width="${(band * .8).toFixed(1)}" height="${hN.toFixed(1)}" rx="2"><title>${MON[i]} normal ${fx(n)} mm</title></rect>`;
    const a = actual[i]; if (isNum(a)) { const hA = ih * a / mx, c = a < n * .75 ? 'm-dry' : a > n * 1.3 ? 'm-wet' : 'm-act';
      s += `<rect class="${c}" x="${(x + band * .3).toFixed(1)}" y="${(T + ih - hA).toFixed(1)}" width="${(band * .4).toFixed(1)}" height="${Math.max(hA, .8).toFixed(1)}" rx="1"><title>${MON[i]}: ${fx(a)} mm</title></rect>`; }
    s += `<text class="ax" x="${(x + band / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle">${MON[i][0]}</text>`; });
  s += `<text class="ax" x="${L}" y="${T - 3}">mm</text>`;
  return svg(W, H, s, 'Monthly rainfall against normal');
}
function diverging(vals, o) {
  const W = 360, H = o.h || 180, L = 36, R = 6, T = 10, B = 22, iw = W - L - R, ih = H - T - B;
  const lim = o.lim || niceMax(Math.max(1, ...vals.filter(isNum).map(Math.abs)));
  const band = iw / vals.length, y0 = T + ih / 2, sc = v => ih / 2 * v / lim; let s = '';
  (o.bands || []).forEach(([a, b]) => { const ya = y0 - sc(b), yb = y0 - sc(a); s += `<rect x="${L}" y="${ya.toFixed(1)}" width="${iw}" height="${(yb - ya).toFixed(1)}" class="m-normal" opacity=".6"/>`; });
  [-lim, 0, lim].forEach(v => { const y = y0 - sc(v); s += `<line class="${v ? 'grid-l' : 'zero'}" x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="ax" x="${L - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end">${o.fmt(v)}</text>`; });
  vals.forEach((v, i) => { const cx = L + band * i + band / 2;
    if (isNum(v)) { const h = sc(Math.min(Math.abs(v), lim)), x = L + band * i + band * .18;
      s += `<rect class="${v >= 0 ? o.pos : o.neg}" x="${x.toFixed(1)}" y="${(v >= 0 ? y0 - h : y0).toFixed(1)}" width="${(band * .64).toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="1.5" ${o.faded && o.faded[i] ? 'opacity=".35"' : ''}><title>${MON[i]}: ${o.fmt(Math.round(v * 100) / 100)}</title></rect>`; }
    else s += `<circle cx="${cx.toFixed(1)}" cy="${y0}" r="1.6" class="ax"/>`;
    s += `<text class="ax" x="${cx.toFixed(1)}" y="${H - 7}" text-anchor="middle">${MON[i][0]}</text>`; });
  return svg(W, H, s, o.title);
}
function lineChart(series, labels, o) {
  const W = o.w || 360, H = o.h || 200, L = 40, R = 12, T = 12, B = 22, iw = W - L - R, ih = H - T - B;
  const all = series.flatMap(s => s.vals.filter(isNum)); if (!all.length) return '<p class="note">No data yet.</p>';
  let mn = o.min ?? Math.min(...all), mx = o.max ?? Math.max(...all);
  if (o.pad) { const p = (mx - mn) * .15 || .1; mn -= p; mx += p; }
  const n = labels.length, xs = i => L + iw * (n === 1 ? .5 : i / (n - 1)), ys = v => T + ih - (v - mn) / (mx - mn) * ih; let s = '';
  for (let k = 0; k <= 3; k++) { const v = mn + (mx - mn) * k / 3, y = ys(v); s += `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="ax" x="${L - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end">${o.fmt(v)}</text>`; }
  series.forEach(se => { let d = '', st = false, first = -1, last = -1;
    se.vals.forEach((v, i) => { if (!isNum(v)) { st = false; return; } if (first < 0) first = i; last = i; d += (st ? 'L' : 'M') + xs(i).toFixed(1) + ' ' + ys(v).toFixed(1); st = true; });
    if (!d) return;
    if (se.area) s += `<path class="${se.cls}-area" d="${d}L${xs(last).toFixed(1)} ${T + ih}L${xs(first).toFixed(1)} ${T + ih}Z"/>`;
    s += `<path class="${se.cls}" fill="none" d="${d}"${se.dash ? ' stroke-dasharray="4 3"' : ''}/>`;
    if (se.dot) s += `<circle class="${se.cls}-dot" cx="${xs(last).toFixed(1)}" cy="${ys(se.vals[last]).toFixed(1)}" r="4"><title>${labels[last]}: ${o.fmt(se.vals[last])}</title></circle>`; });
  labels.forEach((l, i) => { if (i % (o.every || 1) && i !== n - 1) return; s += `<text class="ax" x="${xs(i).toFixed(1)}" y="${H - 7}" text-anchor="middle">${l}</text>`; });
  return svg(W, H, s, o.title);
}
function dial(v, cls) { const r = 46, c = 2 * Math.PI * r, f = c * .75, off = f * (1 - (v || 0) / 100);
  return `<svg class="dial" viewBox="0 0 116 110" role="img" aria-label="Composite risk ${v} of 100"><g transform="rotate(135 58 58)"><circle class="trk" cx="58" cy="58" r="${r}" fill="none" stroke-width="10" stroke-dasharray="${f.toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round"/><circle cx="58" cy="58" r="${r}" fill="none" stroke="var(--${cls})" stroke-width="10" stroke-dasharray="${(f - off).toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round"/></g><text class="val" x="58" y="66" text-anchor="middle">${fx(v)}</text><text class="cap" x="58" y="104" text-anchor="middle">of 100</text></svg>`; }

/* ---------------- maps (Leaflet) ---------------- */
let maps = [];
const BASE = {
  light: () => L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors', maxZoom: 16 }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, pane: 'shadowPane' })]),
  sat: () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics', maxZoom: 19 }),
};
function clearMaps() { maps.forEach(m => m.remove()); maps = []; }
function newMap(id, base = 'light') {
  const el = document.getElementById(id); if (!el || typeof L === 'undefined') return null;
  const m = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
  BASE[base]().addTo(m); maps.push(m); return m;
}
const regionFeature = k => D.geo.features.find(f => f.properties.key === k);
const districtFeature = k => D.dgeo && D.dgeo.features.find(f => f.properties.key === k);
function regionMap(id, layer) {
  const m = newMap(id); if (!m) return;
  const f = regionFeature(state.region);
  const outline = L.geoJSON(f, { style: { color: '#11142E', weight: 2, fill: false } }).addTo(m);
  const df = state.district && districtFeature(state.district);
  const focus = df ? L.geoJSON(df, { style: { color: '#E3A015', weight: 3, fill: false } }).addTo(m) : outline;
  m.fitBounds(focus.getBounds(), { padding: [12, 12] });
  const mm = D.meta.maps && D.meta.maps.regions && D.meta.maps.regions[state.region];
  if (mm && layer) L.imageOverlay(`data/maps/${state.region}_${layer}.png?v=${encodeURIComponent(D.meta.generated)}`, mm.bounds, { opacity: .9 }).addTo(m);
  return m;
}
const mapMissing = () => !D.meta.maps ? '<p class="note">Map images appear after the first Earth Engine pipeline run.</p>'
  : !isCurrentYear() ? `<p class="note">Maps show the latest imagery (${fmtDate(D.meta.maps.ndvi_date)}), not ${state.year}.</p>` : '';

/* ---------------- shell ---------------- */
const ICON = {
  overview: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14"/>',
  crop: '<path d="M12 21v-9 M12 12c0-4-3-6.5-7.5-6.5 0 4.2 3 6.5 7.5 6.5z M12 10c0-3 2.2-5.5 6.5-5.5 0 3.2-2.3 5.5-6.5 5.5z"/>',
  climate: '<path d="M7 15a4 4 0 1 1 .6-8A5 5 0 0 1 17 8a3.5 3.5 0 0 1 0 7z M8 18.5l-1 2 M12 18.5l-1 2 M16 18.5l-1 2"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  risk: '<path d="M12 4l9 16H3z M12 10v4.5 M12 17.2v.3"/>',
  farms: '<path d="M4 8l7-4 9 5-2 11-12-2z"/>',
  report: '<path d="M7 3h7l4 4v14H7z M14 3v4h4 M10 12h5 M10 16h5"/>',
  compare: '<path d="M4 20V9 M9 20V4 M15 20v-8 M20 20V7"/>',
  workspace: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>'
};
const MODS = {
  overview: { n: 'Overview' },
  crop: { n: 'Crop', full: 'Crop intelligence', col: 'green', ltr: 'A', subs: [['health', 'Vegetation health'], ['growth', 'Crop growth'], ['suit', 'Crop suitability'], ['soil', 'Soil and land'], ['season', 'Season assessment']],
    items: ['Vegetation health on farmland', 'Crop growth through the season', 'Crop suitability: climate and soil', 'Soil profile (iSDAsoil)', 'Seasonal assessment'] },
  climate: { n: 'Climate', full: 'Climate intelligence', col: 'gold', ltr: 'B', subs: [['fc', 'Forecast and advice'], ['rain', 'Rainfall'], ['anom', 'Anomalies'], ['temp', 'Temperature'], ['drought', 'Drought'], ['ind', 'Season indicators']],
    items: ['16-day forecast, heat alerts and farming advice', 'Rainfall vs 1991–2020 normal', 'Monthly anomalies', 'Temperature trend since 1996', 'Drought (SPI-3)', 'Onset, cessation, dry spells'] },
  water: { n: 'Water', full: 'Water intelligence', col: 'water', ltr: 'C', subs: [['surface', 'Surface water'], ['res', 'Reservoirs'], ['irr', 'Irrigation planner'], ['stress', 'Water stress']],
    items: ['Surface water from radar', 'Reservoir levels: Tono, Vea, Bontanga, Weija, Bui, Volta…', 'Irrigation planner: hectares each reservoir can water', 'Extent vs 2017–2021 baseline', 'Water balance (rain − PET)', 'Aridity index'] },
  risk: { n: 'Risk', full: 'Agricultural risk', col: 'red', ltr: 'D', subs: [['summary', 'Risk summary'], ['ew', 'Early warning (AI)'], ['map', 'Vegetation anomaly map'], ['change', 'Land change and fires']],
    items: ['AI early warning: chance of a poor season', 'Drought exposure', 'Flood exposure', 'Land degradation trend', 'Production risk', 'Forest loss, fires and cropland change'] },
  farms: { n: 'Farms', full: 'Farm management', col: 'kblack', ltr: 'E', subs: [['trace', 'Map a farm'], ['list', 'Monitored farms']],
    items: ['Trace boundaries on imagery', 'Area and perimeter', 'Sentinel-2 field monitoring', 'Forest-loss check since 2021'] }
};
const LOGO = '<span class="lmk"><img src="assets/logo-mark.svg" alt="" width="28" height="28"></span>';

/* Hero photos: Unsplash License, hotlinked from images.unsplash.com as Unsplash asks, with photographer credit. */
const UTM = '?utm_source=agrointel_africa&utm_medium=referral';
const PHOTOS = {
  nalerigu: { id: 'photo-1727188793085-8d9108789cdd', by: 'Oswald Elsaboath', user: 'ozzzyphotos', page: 'https://unsplash.com/photos/a-young-child-holding-a-corn-on-the-cob-bi5wB6UCZz0', alt: 'A young child holding a cob of maize in Nalerigu, Ghana', pos: '50% 40%' },
  field: { id: 'photo-1562009059-7f43163873a0', by: 'Tomiwa Ogunmodede', user: 'tomiwao', page: 'https://unsplash.com/photos/woman-in-white-and-teal-polo-shirt-standing-near-open-field-jcKbKG8P_6U', alt: 'A woman standing beside an open field', pos: '50% 50%' }
};
const unsplash = (id, w) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=72`;
const RISK_FILL = ['#8DD29A', '#FAB633', '#E8792B', '#C2302A'];
const riskFill = v => !isNum(v) ? '#5E7266' : RISK_FILL[v < 30 ? 0 : v < 50 ? 1 : v < 70 ? 2 : 3];

function ghanaSVG(fill, label) {
  const proj = ([lon, lat]) => [(lon + 3.45) * 60, (11.25 - lat) * 60];
  const path = g => (g.type === 'MultiPolygon' ? g.coordinates.flat() : g.coordinates).map(ring => 'M' + ring.map(p => proj(p).map(v => v.toFixed(1)).join(' ')).join('L') + 'Z').join('');
  return `<svg viewBox="-4 -4 300 410" role="img" aria-label="${esc(label)}">${D.geo.features.map(f => `<path d="${path(f.geometry)}" fill="${fill(f)}"><title>${esc(f.properties.name || '')}</title></path>`).join('')}</svg>`;
}

function buildSlides() {
  const R = D.meta.regions, ne = summary('north-east'), byRisk = [...R].sort((a, b) => b.risk.composite - a.risk.composite)[0];
  const nUnits = D.meta.districts && D.sum.district ? `${D.sum.district.units.length} districts` : `${R.length} regions`;
  const anomTxt = r => !r || !isNum(r.rain_anom) ? 'Rainfall is tracked against the 1991–2020 normal every week.'
    : Math.abs(r.rain_anom) < 5 ? `Rainfall in ${r.name} Region is close to normal so far this season (${sgn(r.rain_anom)}%).`
    : `Rainfall in ${r.name} Region is ${fx(Math.abs(r.rain_anom))}% ${r.rain_anom > 0 ? 'above' : 'below'} normal so far this season.`;
  const keyOf = f => f.properties.key || f.properties.shapeName || f.properties.name;
  const riskOf = f => { const k = keyOf(f); const r = R.find(x => x.key === k || x.name === k); return r ? r.risk.composite : null; };
  const slides = [
    { photo: PHOTOS.nalerigu, place: `Nalerigu · North East Region · ${D.meta.year}`, fact: anomTxt(ne) },
    { map: true, place: `All ${R.length} regions · live`, fact: `Agricultural risk is recomputed every Monday. Highest right now: ${byRisk.name} (${byRisk.risk.composite}/100).` },
    { photo: PHOTOS.field, place: 'Vegetation · every 16 days', fact: `Crop greenness is checked every 16 days across all ${nUnits}, and compared with 2001–2020.` }
  ];
  const fig = $('#slides'), n = slides.length;
  fig.innerHTML = slides.map((s, i) => `<div class="slide${i ? '' : ' on'}${s.map ? ' mapslide' : ''}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}"${i ? ' aria-hidden="true"' : ''}>
      ${s.photo ? `<img src="${unsplash(s.photo.id, 1000)}" srcset="${[640, 1000, 1400].map(w => unsplash(s.photo.id, w) + ' ' + w + 'w').join(', ')}" sizes="(min-width: 960px) 50vw, 100vw" alt="${esc(s.photo.alt)}" style="object-position:${s.photo.pos}"${i ? ' loading="lazy"' : ' fetchpriority="high"'}>
        <span class="credit">Photo: <a href="https://unsplash.com/@${s.photo.user}${UTM}" target="_blank" rel="noopener">${esc(s.photo.by)}</a> / <a href="https://unsplash.com/${UTM}" target="_blank" rel="noopener">Unsplash</a></span>`
      : ghanaSVG(f => riskFill(riskOf(f)), "Map of Ghana's regions coloured by agricultural risk")}
    </div>`).join('') + `<span class="count" aria-hidden="true"><span id="sNum">1</span> / ${n}</span>
    <figcaption><span class="cap-place" id="sPlace"></span><p class="cap-fact" id="sFact"></p><div class="legend-mini" id="sLegend" hidden>${['Low', 'Moderate', 'High', 'Very high'].map((l, i) => `<span><i style="background:${RISK_FILL[i]}"></i>${l}</span>`).join('')}</div>
      <div class="ctrl"><button type="button" class="arw" id="sPrev" aria-label="Previous slide">‹</button><div class="dots">${slides.map((_, i) => `<button type="button" aria-label="Show slide ${i + 1}"${i ? '' : ' aria-current="true"'}></button>`).join('')}</div><button type="button" class="arw" id="sNext" aria-label="Next slide">›</button></div></figcaption>`;
  let cur = 0, timer = null, paused = false;
  const els = [...fig.querySelectorAll('.slide')], dots = [...fig.querySelectorAll('.dots button')];
  const show = k => { cur = (k + n) % n;
    els.forEach((e, i) => { e.classList.toggle('on', i === cur); e.setAttribute('aria-hidden', i === cur ? 'false' : 'true'); });
    dots.forEach((d, i) => i === cur ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current'));
    $('#sNum').textContent = cur + 1; $('#sPlace').textContent = slides[cur].place; $('#sFact').textContent = slides[cur].fact; $('#sLegend').hidden = !slides[cur].map; };
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = () => { clearInterval(timer); if (!reduce) timer = setInterval(() => { if (!paused && !document.hidden) show(cur + 1); }, 6500); };
  $('#sPrev').onclick = () => { show(cur - 1); start(); }; $('#sNext').onclick = () => { show(cur + 1); start(); };
  dots.forEach((d, i) => d.onclick = () => { show(i); start(); });
  fig.addEventListener('mouseenter', () => paused = true); fig.addEventListener('mouseleave', () => paused = false);
  fig.addEventListener('focusin', () => paused = true); fig.addEventListener('focusout', () => paused = false);
  show(0); start();
  $('#credits').innerHTML = `Photos via Unsplash: ${Object.values(PHOTOS).map(p => `<a href="${p.page}${UTM}" target="_blank" rel="noopener">${esc(p.by)}</a>`).join(' and ')}. Data: CHIRPS, ECMWF ERA5-Land, NASA MODIS, ESA Copernicus Sentinel-1 and -2, ESA WorldCover, iSDAsoil, EC JRC, Hansen/UMD/Google/USGS/NASA, geoBoundaries.`;
}

async function buildDemo(key) {
  const box = $('#demo');
  $$('#demoChips .chip-b').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === key)));
  let U; try { U = await unitData('region', key); } catch (e) { box.innerHTML = '<p class="loading">Could not load this region.</p>'; return; }
  const V = asView(U, U.current_year); if (!V) return;
  const rn = V.rain, lm = rn.last_month || 12, mx = niceMax(Math.max(...rn.normal, ...rn.monthly.filter(isNum)));
  const [vc] = vciClass(V.ndvi.vci), [rl, rc] = level(V.risk && V.risk.composite);
  const R = D.meta.regions, dry = [...R].sort((a, b) => b.risk.drought - a.risk.drought)[0];
  const say = `${isNum(rn.anomaly_pct) ? `Rainfall to the end of ${MONTH[lm - 1]} is ${Math.abs(rn.anomaly_pct) < 5 ? 'close to normal' : fx(Math.abs(rn.anomaly_pct)) + '% ' + (rn.anomaly_pct > 0 ? 'above' : 'below') + ' normal'}` : 'Rainfall data is still coming in'}, and vegetation condition is ${vc.toLowerCase()}.`;
  box.innerHTML = `<div class="demo-top" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="demo-body">
      <div class="demo-head"><h3>${esc(V.name)} Region</h3><span>${V.year} · TO ${MON[lm - 1].toUpperCase()}</span></div>
      <p class="demo-say">${esc(say)}</p>
      <div class="tiles"><div class="tile"><small>Rainfall</small><b>${sgn(rn.anomaly_pct)}%</b></div><div class="tile"><small>Vegetation (VCI)</small><b>${fx(V.ndvi.vci)}</b></div><div class="tile"><small>Risk</small><b style="color:var(--${rc === 'good' ? 'good' : rc === 'mod' ? 'mod' : rc === 'warn' ? 'warn' : 'bad'})">${fx(V.risk && V.risk.composite)} ${rl}</b></div></div>
      <div><div class="minibars" role="img" aria-label="Monthly rainfall in ${esc(V.name)} for ${V.year} against the 1991–2020 normal">${rn.normal.map((nv, i) => { const a = rn.monthly[i]; return `<div class="col"><span class="nrm" style="bottom:${(nv / mx * 100).toFixed(1)}%"></span>${isNum(a) && i < lm ? `<span class="act${a < nv * .8 ? ' dry' : ''}" style="height:${Math.max(1, a / mx * 100).toFixed(1)}%"></span>` : ''}</div>`; }).join('')}</div>
        <div class="mlabels" aria-hidden="true">${MON.map(m => `<span>${m[0]}</span>`).join('')}</div></div>
      <div class="demo-key"><span><i style="background:var(--accent)"></i>Rain this year</span><span><i style="background:var(--sun)"></i>Under 80% of normal</span><span><i style="border-top:2px dashed var(--muted);height:0;width:14px"></i>1991–2020 normal</span></div>
      <div class="demo-alert"><span><strong>Highest drought risk: ${esc(dry.name)}</strong> (${dry.risk.drought}/100), SPI-3 ${sgn(dry.spi3, 1)}.</span></div>
      <div class="demo-foot"><a href="#overview" id="demoGo">Open ${esc(V.name)} in the dashboard →</a></div>
    </div>`;
  $('#demoGo').onclick = () => { state.region = key; state.district = null; state.year = D.meta.year; save(); syncPickers(); };
}

function buildLanding() {
  $$('.lm').forEach(e => e.outerHTML = LOGO);
  $('#repoLink').href = REPO;
  $$('[data-to]').forEach(a => a.onclick = e => { e.preventDefault(); const t = document.getElementById(a.dataset.to); if (t) t.scrollIntoView(); });
  const nd = D.meta.districts && D.sum.district ? D.sum.district.units.length : 0;
  $('#heroPill').textContent = `Open data · ${D.meta.regions.length} regions${nd ? ` · ${nd} districts` : ''} · every season since ${D.meta.first_year || D.meta.year}`;
  if (WS) { const a = $('#wsLand'); if (a) a.textContent = 'My workspace'; }
  $('#heroFresh').textContent = `Rainfall data to ${fmtDate(D.meta.rain_latest)} · updated every Monday`;
  buildSlides();
  const picks = ['northern', 'upper-east', 'ashanti', 'volta', 'greater-accra'].filter(k => summary(k));
  $('#demoChips').innerHTML = picks.map(k => `<button type="button" class="chip-b" data-k="${k}" aria-pressed="false">${esc(summary(k).name)}</button>`).join('');
  $$('#demoChips .chip-b').forEach(b => b.onclick = () => buildDemo(b.dataset.k));
  buildDemo(picks[0] || D.meta.regions[0].key);
  $('#modTiles').innerHTML = Object.entries(MODS).filter(([k]) => k !== 'overview').map(([k, m]) => `<a class="modc" href="#${k}"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg></span><h3>${m.full}</h3><ul>${m.items.map(i => `<li>${i}</li>`).join('')}</ul><span class="go">Open ${m.n.toLowerCase()} →</span></a>`).join('') + `<a class="modc" href="#report"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON.report}</svg></span><h3>Reports</h3><ul><li>National, regional or district</li><li>Choose the sections</li><li>Add your name, organisation, logo and notes</li><li>Print or save as PDF</li></ul><span class="go">Create a report →</span></a>`;
  const hasTamale = D.sum.district && sumUnit('district', 'd-tamale-metropolitan');
  $('#trio').innerHTML = `<a class="card dark" href="#climate" id="replay"><span class="tag">SEASON REPLAY</span><h3>Go back to any season since ${D.meta.first_year || 2001}</h3>
      <div class="years" aria-hidden="true"><span>2011</span><span>2013</span><span class="sel">2015</span><span>2019</span><span>2024</span><span>${D.meta.year}</span></div>
      <p>Tamale, 2015: the rains came about six weeks late and the season ended 22% drier than normal.</p></a>
    <a class="card" href="#farms"><span class="tag">FARM TRACER</span><h3>Map a field in a minute</h3><div class="field" aria-hidden="true"></div><p>Draw a boundary on satellite imagery to get its area, greenness through the year, and a tree-loss check since 2021.</p></a>
    <a class="card" href="#workspace"><span class="tag">MY WORKSPACE</span><h3>Your areas, your alerts</h3><div class="gh" aria-hidden="true"><b>●</b> Choose your role and districts<br><b>●</b> Set your own alert levels<br><b>●</b> Reservoirs to watch<br><b>●</b> Reports with your details</div><p>Insurers, extension officers, water managers, NGOs and researchers each get the view they need. Saved privately in your browser.</p></a>`;
  $('#replay').onclick = () => { state.region = 'northern'; state.district = hasTamale ? 'd-tamale-metropolitan' : null; state.year = 2015; state.sub.climate = 'ind'; save(); syncPickers(); };
}

function renderNav(mod) {
  $('#nav').innerHTML = [['workspace', { n: 'My workspace' }], ...Object.entries(MODS), ['compare', { n: 'Compare' }], ['report', { n: 'Report' }]].map(([k, m]) => `<a class="nv${k === 'workspace' ? ' nv-ws' : ''}" href="#${k}"${mod === k ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>${m.n}</a>`).join('');
}

async function route() {
  const h = location.hash.slice(1);
  const inApp = !!MODS[h] || h === 'methods' || h === 'report' || h === 'workspace' || h === 'compare';
  if (h !== 'workspace') state.wsEdit = false;
  document.body.classList.toggle('reporting', h === 'report');
  document.body.classList.toggle('in-app', inApp);
  $('#home').hidden = inApp; $('#app').hidden = !inApp;
  clearMaps();
  if (!inApp) { window.scrollTo(0, 0); return; }
  renderNav(h);
  syncPickers();
  window.scrollTo(0, 0);
  await renderView(h);
}

async function renderView(mod) {
  clearMaps();
  const view = $('#view');
  if (mod === 'methods') { view.innerHTML = methodsView(); return; }
  if (mod === 'report') { await reportView(); return; }
  if (mod === 'compare') { await compareView(); return; }
  if (mod === 'workspace') { view.innerHTML = wsView(); afterWs(); window.scrollTo(0, 0); return; }
  if (mod === 'overview') { view.innerHTML = overview(); afterOverview(); return; }
  view.innerHTML = '<p class="loading">Loading…</p>';
  let U;
  try { U = await unitData(curLevel(), curKey()); } catch (e) { view.innerHTML = `<p class="loading">District data is not available yet. It appears after the next pipeline run.</p>`; return; }
  const R = asView(U, state.year);
  if (!R) { view.innerHTML = `<p class="loading">No data for ${esc(U.name)} in ${state.year}.</p>`; return; }
  const m = MODS[mod], sub = state.sub[mod];
  const place = R.level === 'district' ? `${esc(R.name)} · ${esc((summary(R.region) || {}).name || '')} Region` : `${esc(R.name)} Region`;
  view.innerHTML = `<div class="mhead"><span class="crumb">${place} · ${R.year} season${R.isCurrent ? ' to ' + MONTH[R.rain.last_month - 1] : ''}</span><h1>${m.full}</h1><div class="kente thin"></div></div>
    <div class="subs" role="tablist">${m.subs.map(([k, l]) => `<button class="sub" role="tab" type="button" data-sub="${k}" aria-selected="${k === sub}">${l}</button>`).join('')}</div>
    ${VIEWS[mod][sub](R)}
    <p class="disclaimer">${D.meta.sample ? 'Sample data generated offline. ' : ''}Indicators are computed automatically from open satellite and climate data and have not been validated in the field. See <a href="#methods">data and methods</a>.</p>`;
  $$('[data-sub]').forEach(b => b.onclick = () => { state.sub[mod] = b.dataset.sub; save(); renderView(mod); });
  AFTER[mod] && AFTER[mod][sub] && AFTER[mod][sub](R);
}

/* ---------------- overview ---------------- */
function indValue(r, ind) {
  if (!r) return ['neu', '–'];
  if (ind === 'rain') { const a = r.rain_anom; return [!isNum(a) ? 'neu' : a < -20 ? 'bad' : a < -10 ? 'warn' : a > 25 ? 'neu' : 'good', sgn(a) + '%']; }
  if (ind === 'veg') return [vciClass(r.vci)[1], fx(r.vci)];
  return [level(r.risk && r.risk.composite)[1], fx(r.risk && r.risk.composite)];
}
function alerts() {
  const lv = state.level === 'district' && D.sum.district ? 'district' : 'region', out = [], y = String(state.year);
  (D.sum[lv] || { units: [] }).units.forEach(u => { const r = u.years[y]; if (!r) return;
    const where = lv === 'district' ? `${u.name} (${(summary(u.region) || {}).name})` : u.name;
    if (r.risk.drought >= 60) out.push({ u, lv, mod: 'risk', sev: r.risk.drought, c: level(r.risk.drought)[1], t: `Drought risk ${level(r.risk.drought)[0].toLowerCase()} in ${where}`, d: `SPI-3 ${sgn(r.spi3, 1)}, rainfall ${sgn(r.rain_anom)}% vs normal` });
    if (r.risk.flood >= 55) out.push({ u, lv, mod: 'climate', sev: r.risk.flood, c: level(r.risk.flood)[1], t: `Flood exposure ${level(r.risk.flood)[0].toLowerCase()} in ${where}`, d: `Rainfall ${sgn(r.rain_anom)}% vs normal` });
    if (isNum(r.vci) && r.vci < 20) out.push({ u, lv, mod: 'crop', sev: 80 - r.vci, c: 'warn', t: `Vegetation stress in ${where}`, d: `Condition ${fx(r.vci)} of 100, browner than usual` });
    if (r.rain_anom < -18) out.push({ u, lv, mod: 'climate', sev: -r.rain_anom + 30, c: 'warn', t: `Rainfall deficit in ${where}`, d: `${sgn(r.rain_anom)}% vs the 1991–2020 normal` });
  });
  return out.sort((a, b) => b.sev - a.sev).slice(0, 6);
}
function overview() {
  const lv = curLevel(), u = sumUnit(lv, curKey()) || sumUnit('region', state.region), r = u && u.years[String(state.year)];
  const rs = summary(state.region), al = alerts(), [cl] = level(r && r.risk.composite);
  const name = lv === 'district' ? `${esc(u.name)}` : `${esc(rs.name)} Region`;
  const sub = lv === 'district' ? `District in ${esc(rs.name)} Region. ${esc(rs.zone)}.` : `${esc(rs.zone)}, around ${esc(rs.capital)}.`;
  const legend = state.ind === 'rain' ? [['good', 'Normal'], ['warn', 'Dry'], ['bad', 'Very dry'], ['neu', 'Very wet']] : state.ind === 'veg' ? [['good', 'Above normal'], ['mod', 'Near normal'], ['warn', 'Below'], ['bad', 'Poor']] : [['good', 'Low'], ['mod', 'Moderate'], ['warn', 'High'], ['bad', 'Very high']];
  const yearLbl = isCurrentYear() ? `${state.year} season · rainfall to ${fmtDate(D.meta.rain_latest)}` : `${state.year} season`;
  return `<div class="hello"><span class="lbl">${yearLbl}</span><h1><em>Akwaaba.</em> Here is Ghana at a glance.</h1><p>Tap a ${state.level === 'district' ? 'district' : 'region'} on the map to see how its season went. Change the season at the top.</p></div>
  <div class="ovgrid">
    <section class="panel">
      <div class="toolbar" style="justify-content:space-between">
        <div class="seg" role="group" aria-label="Map indicator">${[['risk', 'Risk'], ['rain', 'Rainfall'], ['veg', 'Vegetation']].map(([k, l]) => `<button type="button" data-ind="${k}" aria-pressed="${state.ind === k}">${l}</button>`).join('')}</div>
        ${D.sum.district ? `<div class="seg" role="group" aria-label="Map level">${[['region', 'Regions'], ['district', 'Districts']].map(([k, l]) => `<button type="button" data-lvl="${k}" aria-pressed="${state.level === k}">${l}</button>`).join('')}</div>` : ''}
      </div>
      <div id="ovmap" class="lmap tall"></div>
      <div class="sw">${legend.map(([c, l]) => `<span><i style="background:${COLOR[c]}"></i>${l}</span>`).join('')}</div>
    </section>
    <div class="stack-v">
      <section class="panel">
        ${r ? verdict(chip(r.status + ' season', statusCls(r.status)), name, `${sub} ${rs.regime === 'uni' ? 'One rainy season, May to October.' : 'Two rainy seasons, roughly April to July and September to November.'}`) : verdict('', name, 'No data for this season.')}
        ${r ? `<div class="facts">${fact('Rainfall', sgn(r.rain_anom) + '%', 'vs normal')}${fact('Vegetation', fx(r.vci), vciClass(r.vci)[0])}${fact('Risk', fx(r.risk.composite), cl)}</div>` : ''}
        <div class="quick"><a class="btn primary" href="#climate">Rainfall detail</a><a class="btn" href="#crop">Crop health</a><a class="btn" href="#risk">Risk</a></div>
      </section>
      <section class="panel">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><h3 style="font-size:18px">Alerts · ${state.year}</h3><span class="lbl">${al.length} shown</span></div>
        ${al.length ? `<div class="alerts">${al.map((a, i) => `<button class="alert" type="button" data-alert="${i}"><span class="bar" style="background:var(--${a.c === 'neu' ? 'water' : a.c})"></span><div><b>${esc(a.t)}</b><span>${esc(a.d)}</span></div><span class="go">View →</span></button>`).join('')}</div>` : `<div class="empty">No alerts for ${state.year}.</div>`}
      </section>
    </div>
  </div>
  <p class="disclaimer">${D.meta.sample ? 'Sample data generated offline. ' : `Updated ${esc(D.meta.generated.slice(0, 10))}. `}<a href="#methods">How these numbers are made</a>.</p>`;
}
function selectUnit(lv, u) {
  if (lv === 'district') { state.region = u.region; state.district = u.key; } else { state.region = u.key; state.district = null; }
  save(); syncPickers();
}
function afterOverview() {
  $$('[data-ind]').forEach(b => b.onclick = () => { state.ind = b.dataset.ind; save(); renderView('overview'); });
  $$('[data-lvl]').forEach(b => b.onclick = () => { state.level = b.dataset.lvl; save(); renderView('overview'); });
  const al = alerts();
  $$('[data-alert]').forEach(b => b.onclick = () => { const a = al[Number(b.dataset.alert)]; selectUnit(a.lv, a.u); location.hash = a.mod; });
  const m = newMap('ovmap'); if (!m) return;
  const lv = state.level === 'district' && D.dgeo ? 'district' : 'region', geo = lv === 'district' ? D.dgeo : D.geo;
  const layer = L.geoJSON(geo, {
    style: f => { const r = sumYear(lv, f.properties.key, state.year), [c] = indValue(r, state.ind), sel = f.properties.key === curKey();
      return { color: sel ? '#11142E' : '#ffffff', weight: sel ? 3 : lv === 'district' ? .6 : 1, fillColor: COLOR[c], fillOpacity: .66 }; },
    onEachFeature: (f, l) => { const r = sumYear(lv, f.properties.key, state.year), [, v] = indValue(r, state.ind);
      if (lv === 'region') l.bindTooltip(v, { permanent: true, direction: 'center', className: 'val' });
      else l.bindTooltip(`${esc(f.properties.name)}: ${v}`, { sticky: true });
      l.on('click', () => { selectUnit(lv, sumUnit(lv, f.properties.key) || { key: f.properties.key, region: f.properties.region }); renderView('overview'); }); }
  }).addTo(m);
  L.geoJSON(D.geo, { style: { color: '#11142E', weight: lv === 'district' ? 1.6 : 1.2, fill: false }, interactive: false }).addTo(m);
  m.fitBounds(layer.getBounds(), { padding: [6, 6] });
}

/* ---------------- module views ---------------- */
const VIEWS = { crop: {}, climate: {}, water: {}, risk: {}, farms: {} }, AFTER = { crop: {}, climate: {}, water: {}, risk: {}, farms: {} };

VIEWS.crop.health = R => { const n = R.ndvi, v = vciClass(n.vci), lm = n.latest_month, cur = lm ? n.monthly[lm - 1] : null, nor = lm ? n.normal[lm - 1] : null;
  const pct = isNum(cur) && isNum(nor) ? (cur / nor - 1) * 100 : null;
  return P(`<div class="split"><div class="stack-v"><div id="m1" class="lmap"></div>
    <div class="legend"><div class="bar" style="background:linear-gradient(90deg,#8c6842,#b8985f,#d6c470,#a0be58,#5c9c46,#267034,#124a28)"></div><div class="ends"><span>Bare soil</span><span>Sparse</span><span>Dense vegetation</span></div></div>${mapMissing()}
    <p class="note">MODIS NDVI, 250 m${D.meta.maps ? ', composite of ' + fmtDate(D.meta.maps.ndvi_date) : ''}.</p></div>
    <div class="stack-v">${verdict(chip(v[0], v[1]), `Vegetation is ${v[0].toLowerCase()}`, n.vci_basis === 'season' ? `Average condition across the ${R.year} growing season, compared with the same months in other years.` : lm ? `Average greenness in ${esc(R.name)} for ${MONTH[lm - 1]} ${n.year} is ${fx(Math.abs(pct))}% ${pct >= 0 ? 'above' : 'below'} the 2001–2020 average for that month.` : 'No recent vegetation data.')}
    <div class="facts">${fact('NDVI', fx(cur, 2), 'normal ' + fx(nor, 2))}${fact('Condition (VCI)', fx(n.vci), '0 worst, 100 best')}</div>
    ${basisNote(R)}
    <p class="note">NDVI measures how green and leafy the land is. The condition score compares this month with the same month in every year since 2001: 50 is typical, above 50 greener than usual, below 50 browner.</p></div></div>`); };
AFTER.crop.health = () => regionMap('m1', 'ndvi');

function basisNote(R) {
  const cp = R.land && R.land.cropland_pct;
  return R.ndviBasis === 'cropland'
    ? `<p class="basis"><b>Farmland only.</b> These figures use only the satellite pixels that are mostly cropland (${fx(cp, 0)}% of the land here, ESA WorldCover 2021), so forest and bush do not hide what crops are doing.</p>`
    : `<p class="basis"><b>All vegetation.</b> ${isNum(cp) ? `Cropland covers only ${fx(cp, 1)}% of the land here on the 2021 land-cover map` : 'There is not enough farmland history yet'}, so these figures use all vegetation. In cocoa areas, farms often show up as tree cover.</p>`;
}

VIEWS.crop.growth = R => { const n = R.ndvi, main = R.suitability.find(c => ['maize', 'sorghum', 'millet', 'rice', 'soy', 'gnut'].includes(c.key));
  const lm = n.latest_month, diff = lm ? (n.monthly[lm - 1] / n.normal[lm - 1] - 1) * 100 : null;
  return P(`${verdict(chip(diff == null ? 'No data' : diff >= -5 ? 'On track' : 'Behind', diff == null ? 'neu' : diff >= -5 ? 'good' : 'warn'), `Greenness in ${n.year} against the usual curve`, `The green line tracks average greenness month by month. Where it sits below the dashed line, vegetation is behind or stressed. `)}
    ${lineChart([{ vals: n.normal, cls: 'l-norm', dash: true }, { vals: n.monthly, cls: 'l-act', area: true, dot: true }], MON.map(m => m[0]), { fmt: v => fx(v, 2), min: 0, max: Math.max(.8, niceMax(Math.max(...n.normal.filter(isNum)))), title: 'Greenness through the season' })}
    <div class="key"><span><i class="line" style="background:var(--green)"></i>${n.year}</span><span><i class="line" style="background:var(--muted)"></i>2001–2020 average</span></div>`); };

VIEWS.crop.suit = R => { const s1 = R.suitability.filter(c => c.class === 'S1'), top = R.suitability[0];
  const head = s1.length > 1 ? `${s1.length} crops are highly suitable in ${esc(R.name)}` : s1.length === 1 ? `${esc(s1[0].name)} is the best fit for ${esc(R.name)}` : `No crop is highly suitable; ${esc(top.name.toLowerCase())} fits best`;
  return P(`${verdict(chip(s1.length ? s1.map(c => c.name).slice(0, 4).join(', ') + (s1.length > 4 ? '…' : '') : suitName(top.class), s1.length ? 'good' : suitCol(top.class)), head, `Scores compare each crop's needs with the 1991–2020 climate here: ${fx(R.rain.annual_normal)} mm of rain a year, ${fx(R.temp.normal, 1)} °C average temperature${isNum(R.season.los_normal) ? ` and a ${R.season.los_normal}-day rainy season` : ''}. ${R.soil ? `Topsoil acidity, depth and texture can lower a score by up to 30%; low fertility is shown under Soil and land but not scored, because fertiliser can fix it.` : 'Soil data is not available yet.'} Within a class, crops are ordered by how close conditions sit to their ideal.`)}
    <div class="rows">${R.suitability.map(c => `<div class="row"><span class="nm">${esc(c.name)}${c.limits && c.limits.length ? `<small class="lim">${esc(c.limits.join(', '))}</small>` : ''}</span><span class="sc">${c.class} · ${c.score}</span>${meter(c.score, suitCol(c.class))}</div>`).join('')}</div>
    <p class="note">Classes follow FAO land evaluation: S1 highly, S2 moderately, S3 marginally suitable, N not suitable.</p>`); };

const SOIL_ROWS = [['ph', 'pH (acidity)', v => fx(v, 1), ''], ['oc', 'Organic carbon', v => fx(v, 1), 'g/kg'], ['n', 'Total nitrogen', v => fx(v, 2), 'g/kg'],
  ['p', 'Phosphorus (extractable)', v => fx(v, 0), 'ppm'], ['k', 'Potassium (extractable)', v => fx(v, 0), 'ppm'], ['depth', 'Depth to bedrock', v => fx(v, 0), 'cm']];
const soilCol = (p, rt) => !rt ? 'neu' : p === 'ph' ? ({ 'Extremely acid': 'bad', 'Strongly acid': 'warn', 'Moderately acid': 'good', 'Neutral': 'good', 'Alkaline': 'mod' }[rt])
  : p === 'depth' ? ({ Shallow: 'warn', 'Moderately deep': 'mod', Deep: 'good' }[rt]) : ({ 'Very low': 'bad', Low: 'warn', Moderate: 'mod', High: 'good' }[rt]);
const LC_COL = { 'Tree cover': '#1F6B3A', Shrubland: '#9BB45A', Grassland: '#D7D27A', Cropland: '#FAB633', 'Built-up': '#C2302A', 'Bare / sparse': '#BFAE95', Water: '#2C6FB5', Wetland: '#5FA8A0', Mangroves: '#0E5A4A' };
VIEWS.crop.soil = R => { const s = R.soil, L = R.land || {};
  const lc = Object.entries(L.pct || {}).filter(([, v]) => v >= 0.1).sort((a, b) => b[1] - a[1]);
  const landHtml = lc.length ? `<div class="stack-v"><h3 style="font-size:18px">Land cover</h3>
    <div class="lcbar" role="img" aria-label="Land cover shares">${lc.map(([k, v]) => `<span style="width:${v}%;background:${LC_COL[k] || '#999'}" title="${esc(k)} ${fx(v, 1)}%"></span>`).join('')}</div>
    <div class="lclist">${lc.map(([k, v]) => `<span><i style="background:${LC_COL[k] || '#999'}"></i>${esc(k)} <b class="mono">${fx(v, v < 1 ? 1 : 0)}%</b></span>`).join('')}</div>
    <p class="note">ESA WorldCover 2021, 10 m. Cropland: about ${fx(L.cropland_km2)} km². Tree crops such as cocoa are usually mapped as tree cover.</p></div>` : '';
  if (!s) return P(`${verdict(chip('No data yet', 'neu'), 'Soil data appears after the next pipeline run', 'The pipeline fetches iSDAsoil once and keeps it.')}${landHtml}`);
  const issues = [];
  if (['Extremely acid', 'Strongly acid'].includes(s.ph.rating)) issues.push('acidic');
  if (['Very low', 'Low'].includes(s.oc.rating)) issues.push('low in organic matter');
  if (['Very low', 'Low'].includes(s.n.rating)) issues.push('low in nitrogen');
  if (s.p.rating === 'Low') issues.push('low in phosphorus');
  if (s.depth.rating === 'Shallow') issues.push('shallow');
  const list = issues.length > 1 ? issues.slice(0, -1).join(', ') + ' and ' + issues.slice(-1) : issues[0];
  const head = issues.length ? `Topsoils here are typically ${list}` : 'Topsoils here have no major limitations';
  const advice = [];
  if (issues.includes('acidic')) advice.push('liming or wood ash');
  if (issues.includes('low in organic matter') || issues.includes('low in nitrogen')) advice.push('manure, compost or legumes');
  if (issues.includes('low in phosphorus')) advice.push('phosphate fertiliser');
  const andList = xs => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0];
  return P(`<div class="split"><div class="stack-v">${verdict(chip(s.texture.name || 'Soil', issues.length > 2 ? 'warn' : issues.length ? 'mod' : 'good'), head, `Average of the top 20 cm across ${esc(R.name)}, excluding towns and water.${advice.length ? ' These are usually managed with ' + andList(advice) + '.' : ''} Individual fields can differ a lot from the average.`)}
    <div class="rows">${SOIL_ROWS.map(([k, lbl, f, u]) => `<div class="row soilrow"><span class="nm">${lbl}</span><span class="sc">${f(s[k].value)}${u ? ' ' + u : ''}</span>${s[k].rating ? chip(s[k].rating, soilCol(k, s[k].rating)) : ''}</div>`).join('')}
      <div class="row soilrow"><span class="nm">Texture (most common)</span><span class="sc">${esc(s.texture.name || '–')}</span></div></div>
    <p class="note">iSDAsoil (Innovative Solutions for Decision Agriculture), 30 m machine-learning predictions from about 100,000 soil samples, representing 2001–2017. These are modelled estimates, not lab tests: test a field's soil before buying lime or fertiliser.</p></div>
    ${landHtml}</div>`); };

function yearBars(ser, o) {
  const ys = Object.keys(ser).map(Number).sort((a, b) => a - b); if (!ys.length) return '<p class="note">No data yet.</p>';
  const W = o.w || 720, H = o.h || 190, L = 44, R = 8, T = 12, B = 22, iw = W - L - R, ih = H - T - B, vals = ys.map(y => ser[y]);
  const mx = niceMax(Math.max(...vals.filter(isNum), o.ref || 0) * 1.05 || 1), band = iw / ys.length; let s = '';
  for (let k = 0; k <= 2; k++) { const v = mx * k / 2, y = T + ih - ih * k / 2; s += `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="ax" x="${L - 5}" y="${y + 3}" text-anchor="end">${v >= 100 ? Math.round(v) : fx(v, v < 10 ? 1 : 0)}</text>`; }
  ys.forEach((y, i) => { const v = ser[y]; if (!isNum(v)) return; const h = ih * v / mx, x = L + band * i;
    s += `<rect x="${(x + band * .15).toFixed(1)}" y="${(T + ih - h).toFixed(1)}" width="${(band * .7).toFixed(1)}" height="${Math.max(h, .6).toFixed(1)}" rx="1.5" class="${o.cls}"${y === o.hi ? ' style="opacity:1"' : ''} ${o.partial === y ? 'opacity=".45"' : ''}><title>${y}: ${fx(v, v < 10 ? 2 : 0)} km²</title></rect>`;
    if (i % (ys.length > 16 ? 5 : 2) === 0 || i === ys.length - 1) s += `<text class="ax" x="${(x + band / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle">${y}</text>`; });
  if (o.ref) { const y = T + ih - ih * o.ref / mx; s += `<line x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--muted)" stroke-dasharray="4 3" stroke-width="1.3"/>`; }
  s += `<text class="ax" x="${L}" y="${T - 3}">km²</text>`;
  return svg(W, H, s, o.title);
}
function changeFacts(R) {
  const c = R.change; if (!c) return null;
  const loss = Object.values(c.forest_loss_km2 || {}).filter(isNum), lossTot = loss.reduce((a, b) => a + b, 0);
  const lossYs = Object.keys(c.forest_loss_km2 || {}), lastLoss = c.forest_loss_km2[lossYs[lossYs.length - 1]];
  const recent = lossYs.slice(-5).map(y => c.forest_loss_km2[y]).filter(isNum), early = lossYs.slice(0, 5).map(y => c.forest_loss_km2[y]).filter(isNum);
  const bYs = Object.keys(c.burned_km2 || {}).sort(), base = bYs.filter(y => y <= '2020').map(y => c.burned_km2[y]).filter(isNum);
  const bAvg = base.length ? base.reduce((a, b) => a + b, 0) / base.length : null;
  const land = R.land && R.land.area_km2;
  const cy = Object.keys(c.cropland_km2 || {}).sort(), c0 = cy.length ? (c.cropland_km2[cy[0]] || 0) + (c.mosaic_km2[cy[0]] || 0) / 2 : null, c1 = cy.length ? (c.cropland_km2[cy[cy.length - 1]] || 0) + (c.mosaic_km2[cy[cy.length - 1]] || 0) / 2 : null;
  return { c, lossTot, lastLoss, lossYear: lossYs[lossYs.length - 1], lossPct: c.forest2000_km2 > 1 ? lossTot / c.forest2000_km2 * 100 : null,
    speeding: recent.length && early.length ? (recent.reduce((a, b) => a + b, 0) / recent.length) / Math.max(.01, early.reduce((a, b) => a + b, 0) / early.length) : null,
    bAvg, bYs, land, cy, c0, c1 };
}
VIEWS.risk.change = R => {
  const F = changeFacts(R); if (!F) return P(verdict(chip('Not yet', 'neu'), 'Land change data appears after the next pipeline run', ''));
  const { c } = F, by = String(R.year), bThis = c.burned_km2[by], partial = R.isCurrent && c.burned_to && !c.burned_to.endsWith('-12');
  const head = F.lossPct != null && F.lossPct >= 5 ? `${fx(F.lossPct, 0)}% of the 2000 tree cover has been lost since 2001` : F.bAvg && F.land && F.bAvg / F.land > .1 ? `Fire burns about ${fx(F.bAvg / F.land * 100, 0)}% of the land in a typical year` : 'Land cover has changed little here since 2001';
  return P(`${verdict(chip(F.speeding > 1.5 ? 'Forest loss speeding up' : F.lossPct >= 5 ? 'Forest loss' : 'Change', F.speeding > 1.5 || F.lossPct >= 10 ? 'warn' : 'mod'), head, `${esc(R.name)}: forest loss from Hansen Global Forest Change (30 m, to ${c.loss_last_year}), burned area from MODIS (500 m, to ${ymTxt(c.burned_to)}), cropland from MODIS land cover (500 m, to ${F.cy[F.cy.length - 1] || '–'}).`)}
    <div class="facts">${fact('Tree cover lost since 2001', fx(F.lossTot, F.lossTot < 10 ? 1 : 0) + ' km²', isNum(F.lossPct) ? `${fx(F.lossPct, 1)}% of ${fx(c.forest2000_km2)} km² in 2000` : '')}${fact(`Lost in ${F.lossYear}`, fx(F.lastLoss, F.lastLoss < 10 ? 1 : 0) + ' km²', isNum(F.speeding) ? `last 5 years ${F.speeding >= 1 ? fx(F.speeding, 1) + '× ' + 'the first 5' : 'below the first 5'}` : '')}${fact(`Burned in ${R.year}`, isNum(bThis) ? fx(bThis) + ' km²' : '–', isNum(F.bAvg) ? `usual ${fx(F.bAvg)} km²${partial ? ' · year not over' : ''}` : '')}${fact('Cropland change', isNum(F.c0) && F.c0 > 0 ? sgn((F.c1 / F.c0 - 1) * 100) + '%' : '–', F.cy.length ? `${F.cy[0]}–${F.cy[F.cy.length - 1]}` : '')}</div>
    <div><h3 class="chh">Tree-cover loss per year</h3>${yearBars(c.forest_loss_km2, { cls: 'm-dry', title: 'Tree-cover loss per year' })}</div>
    <div><h3 class="chh">Area burned per year</h3>${yearBars(c.burned_km2, { cls: 'm-fire', ref: F.bAvg, partial: partial ? R.year : null, title: 'Area burned per year' })}<p class="note">Dashed line: 2001–2020 average. ${partial ? `${R.year} covers January to ${ymTxt(c.burned_to)} only. ` : ''}Most burning in Ghana happens in the dry season (November to March), much of it to clear land or for hunting.</p></div>
    <div><h3 class="chh">Cropland area per year</h3>${yearBars(Object.fromEntries(F.cy.map(y => [y, (c.cropland_km2[y] || 0) + (c.mosaic_km2[y] || 0) / 2])), { cls: 'm-act', title: 'Cropland area per year' })}<p class="note">Cropland plus half of the cropland–natural vegetation mosaic class. At 500 m, small farms in bush or tree crops such as cocoa are often missed, so read the trend rather than the total.</p></div>
    <p class="note">Mining scars are not yet mapped separately; in mining areas they show up within forest loss.</p>`);
};

VIEWS.crop.season = R => { const s = R.season, od = s.onset && isNum(s.onset_normal_doy) ? doyOf(s.onset) - s.onset_normal_doy : null;
  const txt = `Rainfall is ${fx(Math.abs(R.rain.anomaly_pct))}% ${R.rain.anomaly_pct >= 0 ? 'above' : 'below'} normal from January to ${MONTH[R.rain.last_month - 1]}. ` +
    (s.onset ? `The rains started on ${fmtDay(s.onset)}${od != null ? `, ${Math.abs(od)} days ${od > 0 ? 'later' : 'earlier'} than the usual ${doyStr(s.onset_normal_doy)}` : ''}. ` : 'A clear start of the rains has not been detected yet. ') +
    (isNum(s.dry_spells) ? `${s.dry_spells} dry spell${s.dry_spells === 1 ? '' : 's'} of a week or more were recorded. ` : '') +
    `Vegetation condition is ${vciClass(R.ndvi.vci)[0].toLowerCase()}.`;
  return P(`${verdict(chip(R.status, statusCls(R.status)), `A ${R.status.toLowerCase()} season in ${esc(R.name)}`, esc(txt))}
    <div class="facts">${fact('Rainfall', sgn(R.rain.anomaly_pct) + '%', fx(R.rain.total) + ' mm so far')}${fact('Drought index', sgn(R.rain.spi3_latest, 1), R.rain.spi_class)}${fact('Vegetation', 'VCI ' + fx(R.ndvi.vci), vciClass(R.ndvi.vci)[0])}</div>
    <p class="note">Yield forecasts need harvest records to train on, so they are not shown yet.</p>`); };

VIEWS.climate.rain = R => P(`${verdict(chip(fx(R.rain.total) + (R.isCurrent ? ' mm so far' : ' mm'), 'neu'), `Rainfall is ${fx(Math.abs(R.rain.anomaly_pct))}% ${R.rain.anomaly_pct >= 0 ? 'above' : 'below'} normal`, `${R.isCurrent ? `January to ${MONTH[R.rain.last_month - 1]} ${R.year}` : `All of ${R.year}`}, against ${fx(R.rain.normal_to_date)} mm normally. ${R.regime === 'uni' ? 'One rainy season, typical of the north.' : 'Two rainy seasons, typical of the south.'}`)}
  <div class="split"><div>${barsCompare(R.rain.normal, R.rain.monthly)}</div>
  <div class="stack-v"><div class="key" style="display:grid;gap:8px"><span><i style="background:var(--sunk)"></i>1991–2020 normal</span><span><i style="background:var(--accent)"></i>Observed (CHIRPS v3)</span><span><i style="background:var(--warn)"></i>Under 75% of normal</span><span><i style="background:var(--water)"></i>Over 130% of normal</span></div>
  <div class="facts">${fact('Annual normal', fx(R.rain.annual_normal) + ' mm', '')}${fact('Data to', fmtDay(R.rain.latest_date), String(R.year))}</div></div></div>`);

VIEWS.climate.anom = R => { const a = R.rain.monthly_anom, nm = R.rain.normal;
  const dry = a.filter((v, i) => isNum(v) && v < -25 && nm[i] >= 40).length, wet = a.filter((v, i) => isNum(v) && v > 30 && nm[i] >= 40).length;
  const vals = MON.map((_, i) => a[i] ?? null);
  return P(`${verdict(chip(sgn(R.rain.anomaly_pct) + '% overall', R.rain.anomaly_pct < -20 ? 'bad' : R.rain.anomaly_pct < -10 ? 'warn' : 'good'), `${dry} dry month${dry === 1 ? '' : 's'}, ${wet} wet month${wet === 1 ? '' : 's'}`, 'Each bar shows how far a month departed from its 1991–2020 normal. Faded bars are dry-season months, where small totals swing the percentage.')}
    ${diverging(vals, { lim: 100, fmt: v => (v > 0 ? '+' : '') + v + '%', pos: 'b-wet', neg: 'b-dry', title: 'Monthly rainfall anomaly', faded: nm.map(n => n < 20) })}`); };

VIEWS.climate.temp = R => { const t = R.temp, last = t.annual.filter(isNum).slice(-1)[0];
  return P(`${verdict(chip(sgn(t.trend_decade, 2) + ' °C per decade', t.trend_decade > 0 ? 'warn' : 'good'), `${esc(R.name)} is ${t.trend_decade > 0 ? 'warming' : 'not warming'}`, `Annual mean temperature from ERA5-Land. ${R.isCurrent ? `The ${R.year} value (${fx(last, 1)} °C) covers the months available so far.` : `${R.year} averaged ${fx(R.temp.annual[R.temp.years.indexOf(R.year)], 1)} °C.`}`)}
    ${lineChart([{ vals: t.annual, cls: 'l-temp', dot: true }, { vals: (() => { const ok = t.years.map((y, i) => [y, t.annual[i]]).filter(p => isNum(p[1])); const n = ok.length, mx = ok.reduce((a, p) => a + p[0], 0) / n, my = ok.reduce((a, p) => a + p[1], 0) / n; const b = ok.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / ok.reduce((a, p) => a + (p[0] - mx) ** 2, 0); return t.years.map(y => my + b * (y - mx)); })(), cls: 'l-trend', dash: true }], t.years.map(y => "'" + String(y).slice(2)), { fmt: v => fx(v, 1) + '°', pad: true, every: 5, title: 'Annual mean temperature' })}
    <div class="key"><span><i class="line" style="background:var(--gold)"></i>Annual mean</span><span><i class="line" style="background:var(--red)"></i>Linear trend since ${t.years[0]}</span></div>`); };

VIEWS.climate.drought = R => P(`${verdict(chip('SPI ' + sgn(R.rain.spi3_latest, 1), spiCls(R.rain.spi3_latest)), R.rain.spi_class, `The Standardised Precipitation Index compares three-month rainfall with 1991–2020, using a gamma distribution fitted for each calendar month. ${R.isCurrent ? 'The headline is the latest month.' : `The headline is ${MONTH[R.rain.spi_ref_month - 1]}, the end of the main season.`} The shaded band is near normal; below −1.5 is severe drought. Blank months are too dry for SPI to be meaningful.`)}
  ${diverging(R.rain.spi3, { lim: 3, fmt: v => (v > 0 ? '+' : '') + v, pos: 'b-wet', neg: 'b-dry', bands: [[-1, 1]], title: 'SPI-3 by month' })}`);

VIEWS.climate.ind = R => { const s = R.season, od = s.onset && isNum(s.onset_normal_doy) ? doyOf(s.onset) - s.onset_normal_doy : null, cd = s.cessation && isNum(s.cessation_normal_doy) ? doyOf(s.cessation) - s.cessation_normal_doy : null;
  const row = (a, b, c, d) => `<tr><td>${a}</td><td class="n">${b}</td><td class="n">${c}</td><td class="n">${d}</td></tr>`;
  const dd = v => v == null ? '–' : v === 0 ? 'On time' : v > 0 ? v + ' d late' : -v + ' d early';
  return P(`${verdict(chip(!R.isCurrent ? 'Season complete' : s.onset ? 'Season under way' : 'Onset not detected', !R.isCurrent || s.onset ? 'good' : 'warn'), od == null ? (s.onset ? 'Rains have started' : 'Waiting for the rains') : od === 0 ? 'Rains started on time' : `Rains started ${Math.abs(od)} days ${od > 0 ? 'late' : 'early'}`, `Detected from daily CHIRPS rainfall to ${fmtDate(s.last_date)}. Normals are the 1998–2020 averages.`)}
  <div class="tbl-wrap"><table><thead><tr><th>Indicator</th><th class="n">${R.year}</th><th class="n">Normal</th><th class="n">Change</th></tr></thead><tbody>
  ${row('Onset of rains', fmtDay(s.onset), doyStr(s.onset_normal_doy), dd(od))}
  ${row('End of rains', s.cessation ? fmtDay(s.cessation) : 'Not yet', doyStr(s.cessation_normal_doy), dd(cd))}
  ${row('Length of season', isNum(s.los) ? s.los + ' d' : '–', isNum(s.los_normal) ? s.los_normal + ' d' : '–', isNum(s.los) && isNum(s.los_normal) ? sgn(s.los - s.los_normal) + ' d' : '–')}
  ${row('Rainy days (≥1 mm)', fx(s.rainy_days), fx(s.rainy_days_normal), '–')}
  ${row('Dry spells, 7+ days', fx(s.dry_spells), fx(s.dry_spells_normal, 1), '–')}
  </tbody></table></div>
  <p class="note">Onset: first 3-day spell with at least 20 mm, not followed by a week-long dry spell within 30 days. ${R.isCurrent ? 'Rainy days so far this year are compared with a full normal year.' : ''}</p>`); };

VIEWS.water.surface = R => { const w = R.water;
  if (!R.isCurrent) return P(`${verdict(chip('Latest month only', 'neu'), 'Surface water is tracked for the latest month', `Radar water mapping runs on the most recent month (${MONTH[Number(w.month.slice(5)) - 1]} ${w.month.slice(0, 4)}). Switch the season to ${D.meta.year} to see it.`)}`);
  return P(`<div class="split"><div class="stack-v"><div id="m2" class="lmap"></div><div class="sw"><span><i style="background:#1f6fb5"></i>Water detected by Sentinel-1 radar</span></div>${mapMissing()}</div>
  <div class="stack-v">${verdict(chip(isNum(w.pct) ? fx(w.pct) + '% of normal' : 'No baseline', !isNum(w.pct) ? 'neu' : w.pct < 75 ? 'warn' : w.pct > 125 ? 'neu' : 'good'), `${fx(w.current_km2, 0)} km² of surface water`, `Open water detected in ${esc(R.name)}${R.level === 'district' ? ' district' : ''} during ${MONTH[Number(w.month.slice(5)) - 1]} ${w.month.slice(0, 4)}, compared with the same month in 2017–2021. Radar sees through cloud, so this works in the rainy season.`)}
  <div class="facts">${fact('This month', fx(w.current_km2, 0) + ' km²', '')}${fact('Usual', fx(w.normal_km2, 0) + ' km²', '2017–2021')}${fact('Permanent', fx(w.permanent_km2, 0) + ' km²', 'JRC, ≥75% of the time')}</div></div></div>`); };
AFTER.water.surface = () => regionMap('m2', 'water');

const ymTxt = ym => ym ? `${MONTH[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : '–';
const resCls = st => !st ? 'neu' : st === 'Well below usual' ? 'bad' : st === 'Below usual' ? 'warn' : st === 'Above usual' ? 'neu' : 'good';
const resRegion = it => it.region ? ((summary(it.region) || {}).name || it.region) : 'Several regions';
function resChart(it) {
  const ser = it.series, keys = Object.keys(ser).sort(); if (!keys.length) return '<p class="note">No radar data yet.</p>';
  const last = keys[keys.length - 1], ly = Number(last.slice(0, 4)), lmn = Number(last.slice(5, 7)), labels = [], act = [], nor = [];
  for (let i = 59; i >= 0; i--) { const d = new Date(Date.UTC(ly, lmn - 1 - i, 1)), ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    labels.push(d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : ''); act.push(isNum(ser[ym]) ? ser[ym] : null); nor.push(it.stats ? it.stats.monthly_normal[d.getUTCMonth()] : null); }
  const all = [...act, ...nor].filter(isNum);
  return lineChart([{ vals: nor, cls: 'l-norm', dash: true }, { vals: act, cls: 'l-water', area: true, dot: true }], labels.map((l, i) => l || (i === 59 ? MON[lmn - 1] : '')),
    { fmt: v => v >= 100 ? Math.round(v) : fx(v, 1), min: 0, max: niceMax(Math.max(...all) * 1.05), w: innerWidth < 700 ? 420 : 860, h: innerWidth < 700 ? 240 : 220, every: 1, title: `${it.name}: water surface area, last five years` });
}
VIEWS.water.res = R => {
  if (!D.res || !D.res.items.length) return P(verdict(chip('Not yet', 'neu'), 'Reservoir data appears after the next pipeline run', 'The pipeline maps each reservoir once, then measures its water area every month from Sentinel-1 radar.'));
  const rk = R.level === 'district' ? R.region : R.key, items = D.res.items;
  const local = items.filter(i => i.region === rk);
  if (!items.find(i => i.key === state.res)) state.res = (local[0] || items[0]).key;
  const it = items.find(i => i.key === state.res), st = it.stats || {}, yb = st.annual && st.annual[String(R.year)];
  const head = !isNum(st.area_km2) ? `No recent radar data for ${esc(it.name)}` : `${esc(it.name)} holds ${fx(st.area_km2, st.area_km2 < 100 ? 1 : 0)} km² of open water${isNum(st.pct_normal) ? `, ${st.pct_normal}% of its usual area for ${MONTH[Number(st.latest_month.slice(5)) - 1]}` : ''}`;
  const sorted = [...items].sort((a, b) => (b.region === rk) - (a.region === rk) || (a.stats && b.stats ? (a.stats.pct_normal ?? 999) - (b.stats.pct_normal ?? 999) : 0));
  return P(`<div class="split"><div class="stack-v"><div id="m3" class="lmap"></div><p class="note">Outline: largest water extent ever recorded (JRC Global Surface Water, 1984–2021). Imagery © Esri.</p></div>
    <div class="stack-v">${verdict(chip(st.status || 'No data', resCls(st.status)), head, `${esc(it.use)}. ${esc(resRegion(it))}. Surface area measured from Sentinel-1 radar, which sees through cloud, in ${ymTxt(st.latest_month)}.`)}
      <div class="facts">${fact('Water area', isNum(st.area_km2) ? fx(st.area_km2, st.area_km2 < 100 ? 1 : 0) : '–', 'km² · ' + ymTxt(st.latest_month))}${fact('Usual for the month', isNum(st.normal_km2) ? fx(st.normal_km2, st.normal_km2 < 100 ? 1 : 0) : '–', `km² · ${D.res.base[0]}–${D.res.base[1]} average`)}${fact('Of full', isNum(st.fill_pct) ? st.fill_pct + '%' : '–', `full ≈ ${fx(st.full_km2, st.full_km2 < 100 ? 1 : 0)} km²`)}</div>
      ${yb && !R.isCurrent ? `<p class="basis">In ${R.year} the water area ranged from <b>${fx(yb.min, 1)}</b> to <b>${fx(yb.max, 1)} km²</b> (${yb.n} months with radar data).</p>` : ''}
    </div></div>
    <div>${resChart(it)}<p class="note">Monthly water area (blue) against the usual area for each month (dashed). Area is not volume: a full, steep-sided reservoir and a shallow one can hold very different amounts.</p></div>
    <div class="rtable"><table class="rtab small"><thead><tr><th>Reservoir</th><th>Region</th><th>Area</th><th>% of usual</th><th>% of full</th><th>Status</th></tr></thead><tbody>
      ${sorted.map(x => { const t = x.stats || {}; return `<tr class="${x.key === it.key ? 'tot' : ''}"><td><button type="button" class="linkb" data-res="${x.key}">${esc(x.name)}</button></td><td>${esc(resRegion(x))}</td><td>${isNum(t.area_km2) ? fx(t.area_km2, t.area_km2 < 100 ? 1 : 0) + ' km²' : '–'}</td><td>${isNum(t.pct_normal) ? t.pct_normal + '%' : '–'}</td><td>${isNum(t.fill_pct) ? t.fill_pct + '%' : '–'}</td><td>${t.status ? chip(t.status, resCls(t.status)) : '–'}</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="note">Sentinel-1 VV backscatter below −16 dB inside the outline plus 150 m, monthly median. Floating weeds, wind and shallow edges can make the area look smaller than it is.</p>`);
};
AFTER.water.res = () => {
  $$('[data-res]').forEach(b => b.onclick = () => { state.res = b.dataset.res; save(); renderView('water'); });
  const m = newMap('m3', 'sat'); if (!m || !D.resGeo) return;
  const f = D.resGeo.features.find(x => x.properties.key === state.res); if (!f) return;
  const lyr = L.geoJSON(f, { style: { color: '#FAB633', weight: 2.5, fill: true, fillColor: '#2C6FB5', fillOpacity: .15 } }).addTo(m);
  m.fitBounds(lyr.getBounds(), { padding: [10, 10] });
};

VIEWS.water.stress = R => { const b = R.balance, ai = b.aridity, aic = !isNum(ai) ? '–' : ai < .5 ? 'Semi-arid' : ai < .65 ? 'Dry sub-humid' : ai < 1 ? 'Moist sub-humid' : 'Humid';
  return P(`${verdict(chip(b.deficit_months + ' deficit months', b.deficit_months >= 7 ? 'warn' : 'good'), `${b.deficit_months} months where crops need more water than falls`, 'Bars show rainfall minus potential evapotranspiration (MODIS), the water crops and soil would lose. Below zero is a deficit. Faded bars use the normal for months not yet observed.')}
    ${diverging(b.balance, { fmt: v => (v > 0 ? '+' : '') + Math.round(v), pos: 'b-wet', neg: 'b-dry', title: 'Monthly water balance in mm', faded: b.projected })}
    <div class="facts">${fact('Aridity index', fx(ai, 2), aic)}${fact('Rain in ' + R.year, fx(R.rain.total) + ' mm', R.isCurrent ? 'to ' + MON[R.rain.last_month - 1] : 'full year')}</div>
    ${b.pet_basis === 'normal' ? '<p class="note">Evapotranspiration uses the 2001–2020 average for past seasons.</p>' : ''}`); };

VIEWS.risk.summary = R => { const r = R.risk, [cl, cc] = level(r.composite);
  const items = [['Drought exposure', r.drought, `SPI-3 ${sgn(R.rain.spi3_latest, 1)}, rainfall ${sgn(R.rain.anomaly_pct)}% vs normal, ${fx(R.season.dry_spells)} dry spells.`],
    ['Flood exposure', r.flood, `Wettest-month excess and surface water at ${isNum(R.water.pct) ? fx(R.water.pct) + '% of normal' : 'an unknown share of normal'}.`],
    ['Land degradation', r.degradation, `Greenness trend since 2001: ${isNum(R.ndvi.trend_decade) ? sgn(R.ndvi.trend_decade, 3) + ' NDVI per decade' : 'not available'}.`],
    ['Production risk', r.production, `Combines drought, flood and current vegetation condition (VCI ${fx(R.ndvi.vci)}).`]];
  return P(`<div class="composite">${dial(r.composite, cc)}${verdict(chip(cl, cc), `${cl} agricultural risk`, 'A transparent index weighting drought 35%, production 25%, flood 20% and degradation 20%. Above 70 calls for early action.')}</div>
    <div class="risks">${items.map(([n, v, t]) => { const [l, c] = level(v); return `<div class="risk"><div class="hd"><strong>${n}</strong><span class="mono" style="color:var(--${c})">${v} · ${l}</span></div>${meter(v, c)}<p>${esc(t)}</p></div>`; }).join('')}</div>`); };

VIEWS.risk.map = R => P(`<div class="split"><div class="stack-v"><div id="m3" class="lmap"></div>
  <div class="legend"><div class="bar" style="background:linear-gradient(90deg,#a6611a,#dfc27d,#f5f5f5,#80cdc1,#018571)"></div><div class="ends"><span>Much less green</span><span>Normal</span><span>Greener</span></div></div>${mapMissing()}</div>
  ${verdict(chip('Hotspots', 'warn'), 'Where vegetation is under stress', `Latest MODIS NDVI compared with the 2001–2020 average for the same time of year. Brown patches are less green than usual: likely drought stress, late planting or land clearing. Field officers can use this to prioritise visits.`)}</div>`);
AFTER.risk.map = () => regionMap('m3', 'anomaly');

/* ---------------- farms ---------------- */
let DIG = { pts: [], closed: false }, armed = null;
const myFarms = () => store.get('agrointel.farms', []);
function ringArea(latlngs) { // spherical polygon area in m², after Chamberlain & Duquette (2007)
  const Rr = 6378137, rad = Math.PI / 180; let a = 0;
  for (let i = 0; i < latlngs.length; i++) { const p1 = latlngs[i], p2 = latlngs[(i + 1) % latlngs.length];
    a += (p2[1] - p1[1]) * rad * (2 + Math.sin(p1[0] * rad) + Math.sin(p2[0] * rad)); }
  return Math.abs(a * Rr * Rr / 2);
}
function perimeter(latlngs, closed) { let s = 0; for (let i = 0; i < latlngs.length - (closed ? 0 : 1); i++) s += L.latLng(latlngs[i]).distanceTo(L.latLng(latlngs[(i + 1) % latlngs.length])); return s; }
function pip(x, y, ring) { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins; } return ins; }
const regionOf = ([lat, lng]) => { const f = D.geo.features.find(f => f.geometry.coordinates.some(r => pip(lng, lat, r))); return f ? f.properties.key : null; };
const toGeoJSON = f => ({ type: 'Feature', properties: { id: f.id, name: f.name, farmer: f.farmer, community: f.community, region: f.region, crop: f.crop },
  geometry: { type: 'Polygon', coordinates: [[...f.pts.map(p => [+p[1].toFixed(6), +p[0].toFixed(6)]), [+f.pts[0][1].toFixed(6), +f.pts[0][0].toFixed(6)]]] } });

VIEWS.farms.trace = () => P(`${verdict('', 'Trace a farm on satellite imagery', 'Zoom in to the field, then tap each corner. Tap the first point again, or press Close, to finish. Farms you map are saved in this browser and can be downloaded as GeoJSON.')}
  <div id="dig" class="lmap tall"></div>
  <div class="toolbar"><button class="btn sm" id="digUndo" type="button">Undo</button><button class="btn sm" id="digClose" type="button">Close</button><button class="btn sm danger" id="digClear" type="button">Clear</button><span class="readout" id="digOut"></span></div>
  <form class="reg" id="regForm" novalidate>
    <label class="fld" for="fName">Farm name<input id="fName" placeholder="e.g. Savelugu Block 3" autocomplete="off"></label>
    <label class="fld" for="fFarmer">Farmer<input id="fFarmer" placeholder="Full name" autocomplete="off"></label>
    <label class="fld" for="fComm">Community<input id="fComm" placeholder="Village or town" autocomplete="off"></label>
    <label class="fld" for="fCrop">Main crop<select id="fCrop">${['maize', 'sorghum', 'millet', 'rice', 'soy', 'gnut', 'yam', 'cassava', 'cocoa'].map(k => `<option value="${k}">${{ soy: 'Soybean', gnut: 'Groundnut', millet: 'Pearl millet' }[k] || k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select></label>
    <div class="fld" style="align-content:end"><button class="btn primary" id="fSave" type="submit">Save farm</button></div>
  </form>
  <p class="note">Only record farms with the farmer's permission. Saved farms stay on this device.</p>`);
AFTER.farms.trace = () => {
  const m = newMap('dig', 'sat'); if (!m) return;
  const f = (state.district && districtFeature(state.district)) || regionFeature(state.region); m.fitBounds(L.geoJSON(f).getBounds());
  m.scrollWheelZoom.enable();
  const layer = L.layerGroup().addTo(m);
  const draw = () => {
    layer.clearLayers();
    if (DIG.pts.length) {
      (DIG.closed || DIG.pts.length > 2 ? L.polygon : L.polyline)(DIG.pts, { color: '#F0B232', weight: 3, fillOpacity: .2 }).addTo(layer);
      DIG.pts.forEach((p, i) => L.circleMarker(p, { radius: i === 0 ? 8 : 5, color: '#11142E', weight: 2, fillColor: i === 0 ? '#F0B232' : '#fff', fillOpacity: 1 })
        .on('click', e => { L.DomEvent.stopPropagation(e); if (i === 0 && DIG.pts.length > 2) { DIG.closed = true; draw(); } }).addTo(layer));
    }
    const a = DIG.pts.length > 2 ? ringArea(DIG.pts) / 1e4 : 0;
    $('#digOut').innerHTML = `<span>Points <b>${DIG.pts.length}</b></span><span>Area <b>${fx(a, 2)} ha</b></span><span>Perimeter <b>${fx(DIG.pts.length > 1 ? perimeter(DIG.pts, DIG.closed) : 0)} m</b></span>`;
    $('#digClose').disabled = DIG.closed || DIG.pts.length < 3; $('#digUndo').disabled = !DIG.pts.length; $('#digClear').disabled = !DIG.pts.length;
    $('#fSave').disabled = DIG.pts.length < 3 || !$('#fName').value.trim();
  };
  m.on('click', e => { if (DIG.closed) return; DIG.pts.push([+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]); draw(); });
  $('#digUndo').onclick = () => { if (DIG.closed) DIG.closed = false; else DIG.pts.pop(); draw(); };
  $('#digClose').onclick = () => { DIG.closed = true; draw(); };
  $('#digClear').onclick = () => { DIG = { pts: [], closed: false }; draw(); };
  $('#fName').addEventListener('input', draw);
  $('#regForm').addEventListener('submit', e => { e.preventDefault(); const name = $('#fName').value.trim(); if (DIG.pts.length < 3 || !name) return;
    const c = DIG.pts.reduce((a, p) => [a[0] + p[0] / DIG.pts.length, a[1] + p[1] / DIG.pts.length], [0, 0]);
    const farm = { id: 'local-' + Date.now().toString(36), name, farmer: $('#fFarmer').value.trim(), community: $('#fComm').value.trim(), crop: $('#fCrop').value, region: regionOf(c) || state.region, pts: DIG.pts.slice(), created: new Date().toISOString().slice(0, 10) };
    store.set('agrointel.farms', [farm, ...myFarms()]); state.farm = farm.id; state.sub.farms = 'list'; DIG = { pts: [], closed: false }; save(); renderView('farms'); });
  draw();
};

VIEWS.farms.list = () => {
  const mon = (D.farms && D.farms.features) || [], mine = myFarms();
  const all = [...mon.map(f => ({ kind: 'monitored', id: f.properties.id, f })), ...mine.map(f => ({ kind: 'local', id: f.id, f }))];
  if (!all.length) return P('<div class="empty">No farms yet. Use “Map a farm” to trace one.</div>');
  if (!all.find(x => x.id === state.farm)) state.farm = all[0].id;
  const sel = all.find(x => x.id === state.farm);
  const card = x => { const p = x.kind === 'monitored' ? x.f.properties : x.f; const ha = x.kind === 'monitored' ? ringArea(x.f.geometry.coordinates[0].slice(0, -1).map(c => [c[1], c[0]])) / 1e4 : ringArea(x.f.pts) / 1e4;
    return `<button class="farm" type="button" data-farm="${esc(x.id)}" aria-pressed="${x.id === state.farm}"><span class="t">${esc(p.name)}${p.example ? '<span class="badge">Example</span>' : ''}</span>${chip(x.kind === 'monitored' ? 'Monitored' : 'On this device', x.kind === 'monitored' ? 'good' : 'neu')}<span class="m">${esc(p.community || '')}${p.community ? ' · ' : ''}${esc((summary(p.region) || {}).name || p.region)} · ${esc(p.crop)}</span><span class="m mono">${fx(ha, 2)} ha</span></button>`; };
  return `<div class="split" style="align-items:start"><section class="panel">${verdict('', `${all.length} farm${all.length === 1 ? '' : 's'}`, 'Monitored farms are analysed by the weekly Earth Engine run. Farms on this device can be downloaded and added to the repository to be monitored.')}<div class="farms">${all.map(card).join('')}</div></section>${farmReport(sel)}</div>`;
};
function farmReport(x) {
  const mon = x.kind === 'monitored', p = mon ? x.f.properties : x.f;
  const latlngs = mon ? x.f.geometry.coordinates[0].slice(0, -1).map(c => [c[1], c[0]]) : x.f.pts;
  const ha = ringArea(latlngs) / 1e4, s = summary(p.region) || {};
  let body = '';
  if (mon) {
    const nd = p.ndvi || [], nn = p.ndvi_normal || [], lm = nd.map((v, i) => isNum(v) ? i : -1).filter(i => i >= 0).pop();
    const rel = lm != null && isNum(nn[lm]) ? nd[lm] / nn[lm] : null, rc = rel == null ? ['No recent image', 'neu'] : rel >= 1.05 ? ['Greener than usual', 'good'] : rel >= .9 ? ['About usual', 'mod'] : ['Less green than usual', 'warn'];
    const loss = p.loss_ha_since_2021 ?? p.loss_ha_2021_2023;
    body = `${chip(rc[0], rc[1])}
      <div><span class="lbl">Field monitoring · Sentinel-2</span>${lineChart([{ vals: nn, cls: 'l-norm', dash: true }, { vals: nd, cls: 'l-act', area: true, dot: true }], MON.map(m => m[0]), { fmt: v => fx(v, 2), min: 0, max: .9, h: 170, title: 'Field NDVI' })}
      <div class="key"><span><i class="line" style="background:var(--green)"></i>This year</span><span><i class="line" style="background:var(--muted)"></i>2019–2023 median</span></div></div>
      <div class="facts">${fact('Area', fx(ha, 2) + ' ha', fx(ha * 2.471, 2) + ' acres')}${fact('Tree cover 2000', fx(p.treecover2000) + '%', 'Hansen GFC')}${fact('Forest loss', fx(loss, 2) + ' ha', '2021–2025')}</div>
      <p class="note">${isNum(loss) && loss > 0 ? 'Tree-cover loss after 2020 was detected inside this boundary. Check before claiming deforestation-free status.' : 'No tree-cover loss after 2020 detected inside this boundary (Hansen Global Forest Change v1.13, 30 m).'}</p>`;
  } else {
    body = `${chip('Not monitored yet', 'neu')}
      <div class="facts">${fact('Area', fx(ha, 2) + ' ha', fx(ha * 2.471, 2) + ' acres')}${fact('Perimeter', fx(perimeter(latlngs, true)) + ' m', '')}${fact('Region risk', fx((s.risk || {}).composite), level((s.risk || {}).composite)[0])}</div>
      <p class="note">The area and outline are saved in this browser. Weekly Sentinel-2 monitoring runs for farms registered with the project, with the farmer's permission; download the GeoJSON to share it.</p>
      <div class="toolbar"><button class="btn sm primary" id="dl" type="button">Download GeoJSON</button><button class="btn sm danger" id="del" type="button">${armed === x.id ? 'Confirm remove' : 'Remove'}</button></div>`;
  }
  return `<section class="panel">${verdict('', esc(p.name), `${esc(p.farmer || 'Unnamed farmer')} · ${esc(p.community || s.name || '')} · ${esc(p.crop)}`)}<div id="fmap" class="lmap"></div>${body}</section>`;
}
AFTER.farms.list = () => {
  $$('[data-farm]').forEach(b => b.onclick = () => { state.farm = b.dataset.farm; armed = null; save(); renderView('farms'); });
  const mon = (D.farms && D.farms.features) || [], mine = myFarms();
  const mf = mon.find(f => f.properties.id === state.farm), lf = mine.find(f => f.id === state.farm);
  const latlngs = mf ? mf.geometry.coordinates[0].slice(0, -1).map(c => [c[1], c[0]]) : lf ? lf.pts : null;
  if (latlngs) { const m = newMap('fmap', 'sat'); if (m) { const pg = L.polygon(latlngs, { color: '#F0B232', weight: 3, fillOpacity: .15 }).addTo(m); m.fitBounds(pg.getBounds(), { padding: [30, 30], maxZoom: 17 }); } }
  const dl = $('#dl'); if (dl && lf) dl.onclick = () => { const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features: [toGeoJSON(lf)] }, null, 1)], { type: 'application/geo+json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${lf.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.geojson`; document.body.appendChild(a); a.click(); a.remove(); };
  const del = $('#del'); if (del && lf) del.onclick = () => { if (armed === lf.id) { store.set('agrointel.farms', mine.filter(f => f.id !== lf.id)); armed = null; state.farm = null; save(); renderView('farms'); } else { armed = lf.id; del.textContent = 'Confirm remove'; } };
};

/* ---------------- methods ---------------- */
function methodsView() {
  const m = D.meta;
  return `<div class="mhead"><span class="crumb">About this project</span><h1>Data and methods</h1><div class="kente thin"></div></div>
  <section class="panel"><div class="prose">
    <p>AgroIntel Africa is a personal, noncommercial portfolio project. A Python pipeline runs weekly on GitHub Actions, queries Google Earth Engine, and writes the JSON and map images this site reads. ${m.sample ? '<strong>The data shown now is sample data generated offline; the pipeline has not run yet.</strong>' : `Last update: ${esc(m.generated)}; rainfall data to ${fmtDate(m.rain_latest)}.`}</p>
    <h3>Data sources</h3>
    <ul>
      <li><strong>Rainfall:</strong> CHIRPS v3 (UCSB Climate Hazards Center), about 5.5 km. Monthly totals from the version available since 1981; daily timing (onset, dry spells) from the IMERG-based daily version available since 1998.</li>
      <li><strong>Temperature:</strong> ERA5-Land monthly (ECMWF/Copernicus), about 11 km.</li>
      <li><strong>Vegetation:</strong> MODIS Terra NDVI (MOD13Q1), 250 m, 16-day, with cloudy pixels removed; Sentinel-2 surface reflectance, 10 m, for farms.</li>
      <li><strong>Evapotranspiration:</strong> MODIS MOD16A2 potential evapotranspiration, 500 m.</li>
      <li><strong>Water:</strong> Sentinel-1 radar (VV backscatter below −16 dB) within the JRC Global Surface Water maximum extent; JRC occurrence for permanent water.</li>
      <li><strong>Forest:</strong> Hansen Global Forest Change v1.13 (tree cover 2000, loss year to 2025).</li>
      <li><strong>Land cover:</strong> ESA WorldCover 2021 v200, 10 m (CC BY 4.0).</li>
      <li><strong>Forecast:</strong> Open-Meteo 16-day forecast (CC BY 4.0) for the centre of each district: rain, maximum and minimum temperature, reference evapotranspiration.</li>
      <li><strong>Land change and fires:</strong> Hansen Global Forest Change (tree-cover loss per year), MODIS MCD64A1 burned area (500 m, monthly), MODIS MCD12Q1 land cover (500 m, annual) for cropland.</li>
      <li><strong>Reservoirs:</strong> outlines from the JRC Global Surface Water maximum extent (1984–2021); monthly water area from Sentinel-1 radar since 2015.</li>
      <li><strong>Soil:</strong> iSDAsoil Africa v1, 30 m topsoil predictions (CC BY 4.0).</li>
      <li><strong>Boundaries:</strong> geoBoundaries for Ghana's 16 regions and 260 districts (2019 set, CC BY 4.0).</li>
    </ul>
    <h3>Methods</h3>
    <ul>
      <li><strong>Normals</strong> use 1991–2020 (WMO standard) for rainfall totals and temperature, 1998–2020 for daily season indicators, and 2001–2020 for vegetation.</li>
      <li><strong>SPI-3</strong> fits a gamma distribution, with a probability of zero rain, to three-month totals for each calendar month (McKee et al., 1993).</li>
      <li><strong>Onset</strong> is the first 3-day spell with at least 20 mm after 1 April (north) or 1 March (south), not followed by 7 dry days within 30 days. <strong>Cessation</strong> is the first wet day after 1 September (north) or 15 October (south) followed by less than 10 mm in 20 days.</li>
      <li><strong>Vegetation condition (VCI)</strong> is a standardised form of Kogan's (1995) index: how far this month's regional NDVI is from the same month in other years since 2001, scaled to 0–100 where 50 is typical. Changes smaller than the satellite's noise (0.04 NDVI) cannot reach the extremes. Only complete months are used.</li>
      <li><strong>Farmland-only vegetation:</strong> a 250 m MODIS pixel counts as farmland when at least 30% of the 10 m WorldCover pixels inside it are cropland. Where cropland covers at least 3% of a region or district, its NDVI and VCI use farmland pixels only; elsewhere (mostly cocoa and forest areas) they use all vegetation. The greening trend always uses all land.</li>
      <li><strong>Crop suitability</strong> scores growing-season rainfall (annual crops) or annual rainfall (perennials), mean temperature and rainy-season length against simplified FAO ECOCROP ranges, then lowers the score by up to 30% for topsoil pH outside the crop's range, soil shallower than it needs, or heavy clay for root and pod crops.</li>
      <li><strong>Forecast advice:</strong> rules combine the forecast with the season's satellite record: a dry spell is 7 or more days under 1 mm; hot days reach 35 °C and severe heat 38 °C; heavy rain is 20 mm in a day and very heavy 50 mm; the weekly crop water shortfall is reference evapotranspiration minus forecast rain.</li>
      <li><strong>Irrigation planner:</strong> crop water need = FAO-56 crop coefficients (initial, mid, late stages) × MODIS potential evapotranspiration for each month, minus effective rainfall (USDA-SCS) from the 1991–2020 normal, divided by the method's efficiency. Water available = current reservoir area × usable depth × irrigation share, less open-water evaporation (1.05 × PET over 80% of the area). Depth and share are the user's assumptions.</li>
      <li><strong>Early warning (AI):</strong> a logistic regression trained every week on all district-seasons since 2002. Inputs known at the end of July: rainfall January–July against normal, SPI-3 in July, June–July greenness anomaly, how late the rains were, whether they had started, and one or two rainy seasons. Target: September–October greenness among the worst fifth of that district's years. Skill is measured by leaving out one whole year at a time.</li>
      <li><strong>Ask AgroIntel:</strong> the built-in assistant matches the place and topic in a question and answers from this site's data and the forecast. In AI mode, the same data goes to a large language model through a proxy, with instructions to use only the numbers provided.</li>
      <li><strong>Reservoirs:</strong> each outline is the largest water body in the JRC maximum water extent within a box drawn around the reservoir. Each month, Sentinel-1 VV backscatter below −16 dB (median of the month's passes) inside the outline plus 150 m gives the open-water area. "Usual" is the 2017–2023 average for that calendar month; "full" is the 95th percentile of all monthly areas. This is surface area, not stored volume, and floating weeds or wind can make it read low.</li>
      <li><strong>Soil ratings</strong> use the iSDAsoil 0–20 cm means, back-transformed per pixel and averaged over land that is not built-up or water. Bands: pH below 4.5 extremely, 4.5–5.5 strongly, 5.5–6.5 moderately acid; organic carbon below 6, 12 and 20 g/kg very low, low, moderate; total nitrogen below 0.5, 1 and 2 g/kg; extractable phosphorus below 10 and 25 ppm; potassium below 60 and 150 ppm; bedrock shallower than 50 and 100 cm.</li>
      <li><strong>Past seasons</strong> (2001 onward) use full-year rainfall, SPI-3 at the end of the main season, and vegetation condition averaged over the growing season. Surface water and map images cover the latest month only.</li>
      <li><strong>Risk indices</strong> are transparent heuristics (0–100) combining SPI, rainfall anomaly, dry spells, surface water, NDVI trend and VCI. They are indicators for discussion, not validated predictions.</li>
    </ul>
    <h3>Checks against known seasons</h3>
    <ul>
      <li><strong>2015, northern Ghana:</strong> NOAA's Africa Hazards Outlook of 16 July 2015 reported a delayed onset followed by poorly distributed rain across central and northern Ghana, with planting delayed. For Tamale this platform shows the rains established on 9 June against a usual date around 26 April (about six weeks late), a season 22% drier than normal, and a rainy season of 140 days against a usual 182.</li>
      <li>More checks, against Ghana Meteorological Agency station records and field reports, are planned for version 2. Corrections are welcome.</li>
    </ul>
    <h3>Limitations</h3>
    <ul>
      <li>Regional averages hide large differences within each region.</li>
      <li>Nothing here has been validated against field observations yet.</li>
      <li>Radar water detection can confuse smooth surfaces with water; restricting to the historical water extent reduces but does not remove this.</li>
    </ul>
    <p>Code and documentation: <a href="${REPO}" target="_blank" rel="noopener">${REPO.replace('https://', '')}</a></p>
  </div></section>`;
}

/* ---------------- boot ---------------- */
/* ---------------- report builder ---------------- */
const RSECT = [['rain', 'Rainfall and drought'], ['season', 'Rainy season timing'], ['veg', 'Vegetation condition'], ['soil', 'Soil and land'],
  ['crops', 'Crop suitability'], ['water', 'Water'], ['res', 'Reservoirs'], ['change', 'Land change and fires'], ['risk', 'Agricultural risk'], ['table', 'Area breakdown table']];
const RDEF = { scope: 'unit', sections: RSECT.map(s => s[0]), title: '', ref: '', forOrg: '', byName: '', byRole: '', byOrg: '', byContact: '', notes: '', logo: '', remember: true };
let REP = Object.assign({}, RDEF, store.get('agrointel.report', {}));
const andJoin = xs => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : (xs[0] || '');
const pctTxt = v => !isNum(v) ? 'no data' : Math.abs(v) < 5 ? `close to normal (${sgn(v)}%)` : `${fx(Math.abs(v))}% ${v > 0 ? 'above' : 'below'} normal`;

function polyArea(g) { // planar area in degrees², enough for weights
  const rings = g.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : [g.coordinates[0]];
  return rings.reduce((a, r) => a + Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2, 0);
}
function mapSVG(features, fill, focusKey, label) {
  const pts = features.flatMap(f => (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat() : f.geometry.coordinates).flat());
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = 300, sc = W / (x1 - x0), H = Math.round((y1 - y0) * sc);
  const path = g => (g.type === 'MultiPolygon' ? g.coordinates.flat() : g.coordinates).map(r => 'M' + r.map(p => `${((p[0] - x0) * sc).toFixed(1)} ${((y1 - p[1]) * sc).toFixed(1)}`).join('L') + 'Z').join('');
  return `<svg class="rmap" viewBox="-2 -2 ${W + 4} ${H + 4}" role="img" aria-label="${esc(label)}">${features.map(f => `<path d="${path(f.geometry)}" fill="${fill(f)}" stroke="#fff" stroke-width=".8"/>`).join('')}${focusKey ? features.filter(f => f.properties.key === focusKey).map(f => `<path d="${path(f.geometry)}" fill="none" stroke="#10201A" stroke-width="2.2"/>`).join('') : ''}</svg>`;
}
const RISK_LEG = () => `<div class="rleg">${['Low', 'Moderate', 'High', 'Very high'].map((l, i) => `<span><i style="background:${RISK_FILL[i]}"></i>${l}</span>`).join('')}<span><i style="background:#D5DBD3"></i>No data</span></div>`;

/* National view: area-weighted average of the 16 region files */
async function nationalView(y) {
  const Us = await Promise.all(D.meta.regions.map(r => unitData('region', r.key)));
  const Vs = Us.map(U => asView(U, y)).filter(Boolean); if (!Vs.length) return null;
  const w = Vs.map(V => polyArea(regionFeature(V.key).geometry)), W = w.reduce((a, b) => a + b, 0);
  const avg = get => { let s = 0, ws = 0; Vs.forEach((V, i) => { const v = get(V); if (isNum(v)) { s += v * w[i]; ws += w[i]; } }); return ws ? s / ws : null; };
  const lm = Vs[0].rain.last_month;
  const monthly = Array.from({ length: lm }, (_, m) => avg(V => V.rain.monthly[m])), normal = Array.from({ length: 12 }, (_, m) => avg(V => V.rain.normal[m]));
  const tot = monthly.reduce((a, b) => a + (b || 0), 0), ntot = normal.slice(0, lm).reduce((a, b) => a + b, 0);
  return { national: true, key: 'ghana', name: 'Ghana', year: y, isCurrent: Vs[0].isCurrent, Vs,
    rain: { monthly, normal, last_month: lm, total: tot, normal_to_date: ntot, anomaly_pct: (tot / ntot - 1) * 100, latest_date: Vs[0].rain.latest_date },
    ndvi: { vci: avg(V => V.ndvi.vci), monthly: Array.from({ length: 12 }, (_, m) => avg(V => V.ndvi.monthly[m])), normal: Array.from({ length: 12 }, (_, m) => avg(V => V.ndvi.normal[m])) },
    risk: Object.fromEntries(['composite', 'drought', 'flood', 'degradation', 'production'].map(k => [k, Math.round(avg(V => V.risk && V.risk[k]))])) };
}

function keyMessages(R, rows) {
  const out = [], lm = R.rain.last_month, through = R.isCurrent ? `January to ${MONTH[lm - 1]} ${R.year}` : `${R.year}`;
  if (R.status) out.push(`Overall the ${R.year} season ${R.isCurrent ? 'is' : 'was'} rated <b>${esc(R.status.toLowerCase())}</b>, from rainfall, drought index and vegetation condition together.`);
  if (isNum(R.rain.anomaly_pct)) out.push(`Rainfall for ${through} was ${fx(R.rain.total)} mm, <b>${pctTxt(R.rain.anomaly_pct)}</b> against the 1991–2020 average of ${fx(R.rain.normal_to_date)} mm.`);
  if (!R.national && isNum(R.rain.spi3_latest)) out.push(`The three-month drought index (SPI-3) at the end of ${MONTH[R.rain.spi_ref_month - 1]} was ${sgn(R.rain.spi3_latest, 1)}: <b>${esc(R.rain.spi_class.toLowerCase())}</b>.`);
  const s = R.season;
  if (s && s.onset && isNum(s.onset_normal_doy)) { const d = doyOf(s.onset) - s.onset_normal_doy;
    out.push(`The rains became established on ${fmtDate(s.onset)}, <b>${Math.abs(d) <= 7 ? 'close to the usual date' : Math.abs(d) + ' days ' + (d > 0 ? 'later' : 'earlier') + ' than usual'}</b> (${doyStr(s.onset_normal_doy)}).`); }
  else if (s && R.isCurrent && !s.onset) out.push('The main rainy season had not become established by the usual measure.');
  if (isNum(R.ndvi.vci)) out.push(`Vegetation condition scored ${fx(R.ndvi.vci)} out of 100 (<b>${vciClass(R.ndvi.vci)[0].toLowerCase()}</b>; 50 is typical)${R.ndviBasis === 'cropland' ? ', measured on farmland only' : ''}.`);
  if (R.risk && isNum(R.risk.composite)) { const drv = ['drought', 'flood', 'degradation', 'production'].sort((a, b) => R.risk[b] - R.risk[a])[0];
    out.push(`Composite agricultural risk is <b>${R.risk.composite}/100 (${level(R.risk.composite)[0].toLowerCase()})</b>, driven mainly by ${drv} risk (${R.risk[drv]}).`); }
  if (rows && rows.length) { const st = s => rows.filter(r => r.status === s).length, hi = [...rows].filter(r => isNum(r.risk)).sort((a, b) => b.risk - a.risk).slice(0, 3);
    out.push(`Of ${rows.length} ${R.national ? 'regions' : `districts in ${esc((summary(R.level === 'district' ? R.region : R.key) || {}).name || '')} Region`}, ${st('Favourable')} ${st('Favourable') === 1 ? 'is' : 'are'} favourable, ${st('Watch')} on watch and ${st('Stressed')} stressed. Highest risk: ${andJoin(hi.map(r => `${esc(r.name)} (${r.risk})`))}.`); }
  return out;
}

function breakdownRows(R) {
  const y = String(R.year);
  if (R.national) return D.meta.regions.map(r => { const b = sumYear('region', r.key, y) || {}; return { key: r.key, name: r.name, rain: b.rain_anom, vci: b.vci, spi: b.spi3, risk: b.risk && b.risk.composite, drought: b.risk && b.risk.drought, status: b.status }; });
  const rk = R.level === 'district' ? R.region : R.key;
  if (D.sum.district) return D.sum.district.units.filter(u => u.region === rk).map(u => { const b = u.years[y] || {}; return { key: u.key, name: u.name, rain: b.rain_anom, vci: b.vci, spi: b.spi3, risk: b.risk && b.risk.composite, drought: b.risk && b.risk.drought, status: b.status }; });
  return null;
}

function reportDoc(R) {
  const on = k => REP.sections.includes(k), rows = breakdownRows(R);
  const regName = R.national ? '' : R.level === 'district' ? `${esc(R.name)}, ${esc((summary(R.region) || {}).name || '')} Region` : `${esc(R.name)} Region`;
  const place = R.national ? 'Ghana (all 16 regions)' : regName;
  const title = REP.title.trim() || `Agricultural season report: ${R.national ? 'Ghana' : R.level === 'district' ? R.name : R.name + ' Region'}, ${R.year}`;
  const lm = R.rain.last_month, period = R.isCurrent ? `January to ${MONTH[lm - 1]} ${R.year} (rainfall data to ${fmtDate(D.meta.rain_latest)})` : `January to December ${R.year}`;
  const today = fmtDate(new Date().toISOString().slice(0, 10));
  const sec = (n, t, body) => `<section class="rsec"><h2><span>${n}</span>${t}</h2>${body}</section>`;
  let n = 1; const parts = [];
  parts.push(sec(n++, 'Key messages', `<ul class="rkey">${keyMessages(R, rows).map(m => `<li>${m}</li>`).join('')}</ul>`));
  const tiles = [['Rainfall vs normal', isNum(R.rain.anomaly_pct) ? sgn(R.rain.anomaly_pct) + '%' : '–'], ['Vegetation (VCI)', fx(R.ndvi.vci)], ['Risk (0–100)', fx(R.risk && R.risk.composite)]];
  if (!R.national) tiles.splice(1, 0, ['SPI-3', sgn(R.rain.spi3_latest, 1)]);
  if (R.status) tiles.push(['Season status', R.status]);
  parts[0] = parts[0].replace('</section>', `<div class="rtiles">${tiles.map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('')}</div></section>`);
  if (on('rain')) parts.push(sec(n++, 'Rainfall and drought', `<div class="rgrid"><div>${barsCompare(R.rain.normal, R.rain.monthly)}<p class="rcap">Monthly rainfall (bars) against the 1991–2020 average (grey). Orange: under 75% of normal; blue: over 130%.</p></div>
    ${R.national ? `<div><p>Total ${fx(R.rain.total)} mm against a normal of ${fx(R.rain.normal_to_date)} mm for the same months: ${pctTxt(R.rain.anomaly_pct)}. Figures are area-weighted averages of the 16 regions.</p></div>`
    : `<div>${diverging(R.rain.spi3, { lim: 3, fmt: v => (v > 0 ? '+' : '') + v, pos: 'b-wet', neg: 'b-dry', bands: [[-1, 1]], title: 'SPI-3 by month' })}<p class="rcap">SPI-3 by month. Below −1 is moderately dry, below −1.5 severely dry, below −2 extremely dry.</p></div>`}</div>`));
  if (on('season') && !R.national) { const s = R.season;
    parts.push(sec(n++, 'Rainy season timing', `<table class="rtab"><thead><tr><th>Indicator</th><th>${R.year}</th><th>Usual (1998–2020)</th></tr></thead><tbody>
      <tr><td>Onset of rains</td><td>${s.onset ? fmtDate(s.onset) : 'Not yet established'}</td><td>${doyStr(s.onset_normal_doy)}</td></tr>
      <tr><td>End of rains</td><td>${s.cessation ? fmtDate(s.cessation) : R.isCurrent ? 'Not yet' : '–'}</td><td>${doyStr(s.cessation_normal_doy)}</td></tr>
      <tr><td>Season length (days)</td><td>${fx(s.los)}</td><td>${fx(s.los_normal)}</td></tr>
      <tr><td>Rainy days (≥ 1 mm)</td><td>${fx(s.rainy_days)}</td><td>${fx(s.rainy_days_normal)}</td></tr>
      <tr><td>Dry spells (7+ days) in season</td><td>${fx(s.dry_spells)}</td><td>${fx(s.dry_spells_normal, 1)}</td></tr></tbody></table>`)); }
  if (on('veg')) parts.push(sec(n++, 'Vegetation condition', `<div class="rgrid"><div>${lineChart([{ vals: R.ndvi.normal, cls: 'l-norm', dash: true }, { vals: R.ndvi.monthly, cls: 'l-act', area: true, dot: true }], MON.map(m => m[0]), { fmt: v => fx(v, 2), min: 0, max: .9, h: 180, title: 'NDVI by month' })}<p class="rcap">Monthly greenness (NDVI, MODIS 250 m), ${R.year} (green) against the 2001–2020 average (dashed).</p></div>
    <div><p>Vegetation condition index: <b>${fx(R.ndvi.vci)}</b> out of 100 (${vciClass(R.ndvi.vci)[0].toLowerCase()}). 50 is typical for the time of year; below 25 indicates poor condition.</p>${R.national ? '' : `<p>${R.ndviBasis === 'cropland' ? `Measured on farmland only: pixels that are mostly cropland, which covers ${fx(R.land && R.land.cropland_pct, 0)}% of the land (ESA WorldCover 2021).` : 'Measured on all vegetation, as farmland is too small a share of the land here to measure separately.'}</p>`}</div></div>`));
  if (on('soil') && !R.national && R.soil) { const S = R.soil, lc = Object.entries((R.land && R.land.pct) || {}).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
    parts.push(sec(n++, 'Soil and land', `<div class="rgrid"><table class="rtab"><thead><tr><th>Topsoil (0–20 cm)</th><th>Value</th><th>Rating</th></tr></thead><tbody>${SOIL_ROWS.map(([k, l, f, u]) => `<tr><td>${l}</td><td>${f(S[k].value)}${u ? ' ' + u : ''}</td><td>${esc(S[k].rating || '–')}</td></tr>`).join('')}<tr><td>Texture (most common)</td><td colspan="2">${esc(S.texture.name || '–')}</td></tr></tbody></table>
      <div><table class="rtab"><thead><tr><th>Land cover (2021)</th><th>Share</th></tr></thead><tbody>${lc.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${fx(v, 0)}%</td></tr>`).join('')}</tbody></table><p class="rcap">Soil: iSDAsoil 30 m model predictions (2001–2017), averaged across the area; not a substitute for a field soil test. Land cover: ESA WorldCover 2021.</p></div></div>`)); }
  if (on('crops') && !R.national && R.suitability) parts.push(sec(n++, 'Crop suitability', `<table class="rtab"><thead><tr><th>Crop</th><th>Class</th><th>Score</th><th>Limitations</th></tr></thead><tbody>${R.suitability.map(c => `<tr><td>${esc(c.name)}</td><td>${c.class} · ${suitName(c.class)}</td><td>${c.score}</td><td>${esc([...(isNum(c.climate) && c.climate < 80 ? ['climate'] : []), ...(c.limits || [])].join(', ') || '–')}</td></tr>`).join('')}</tbody></table><p class="rcap">FAO land-evaluation classes from the 1991–2020 climate and topsoil. Long-term suitability, not a forecast for this season.</p>`));
  if (on('water') && !R.national && R.water && R.isCurrent) { const w = R.water;
    parts.push(sec(n++, 'Water', `<p>Surface water detected by Sentinel-1 radar in ${MONTH[Number(w.month.slice(5)) - 1]} ${w.month.slice(0, 4)}: <b>${fx(w.current_km2, 1)} km²</b>${isNum(w.pct) ? `, ${fx(w.pct)}% of the 2017–2021 average for that month (${fx(w.normal_km2, 1)} km²)` : ''}. Permanent water: ${fx(w.permanent_km2, 1)} km².${R.balance ? ` Annual rainfall is ${fx(R.balance.aridity, 2)} times potential evaporation (aridity index), with ${R.balance.deficit_months} months in water deficit.` : ''}</p>`)); }
  if (on('res') && D.res) { const rk = R.national ? null : R.level === 'district' ? R.region : R.key, rs = D.res.items.filter(i => R.national || i.region === rk);
    if (rs.length) parts.push(sec(n++, 'Reservoirs', `<table class="rtab"><thead><tr><th>Reservoir</th><th>Main use</th><th>Water area</th><th>% of usual</th><th>% of full</th><th>Status</th></tr></thead><tbody>${rs.map(x => { const t = x.stats || {}; return `<tr><td>${esc(x.name)}</td><td>${esc(x.use)}</td><td>${isNum(t.area_km2) ? fx(t.area_km2, t.area_km2 < 100 ? 1 : 0) + ' km²' : '–'}</td><td>${isNum(t.pct_normal) ? t.pct_normal + '%' : '–'}</td><td>${isNum(t.fill_pct) ? t.fill_pct + '%' : '–'}</td><td>${esc(t.status || '–')}</td></tr>`; }).join('')}</tbody></table><p class="rcap">Open-water surface area from Sentinel-1 radar for ${ymTxt(D.res.month)}, against the ${D.res.base[0]}–${D.res.base[1]} average for the same month. Area, not volume.</p>`)); }
  if (on('change') && !R.national) { const F = changeFacts(R); if (F) { const c = F.c, bThis = c.burned_km2[String(R.year)];
    parts.push(sec(n++, 'Land change and fires', `<div class="rgrid"><div>${yearBars(c.forest_loss_km2, { cls: 'm-dry', w: 360, h: 170, title: 'Tree-cover loss per year' })}<p class="rcap">Tree-cover loss per year, km² (Hansen GFC).</p></div><div>${yearBars(c.burned_km2, { cls: 'm-fire', ref: F.bAvg, w: 360, h: 170, title: 'Area burned per year' })}<p class="rcap">Area burned per year, km² (MODIS); dashed: 2001–2020 average.</p></div></div>
      <p>Tree cover lost since 2001: <b>${fx(F.lossTot, 1)} km²</b>${isNum(F.lossPct) ? ` (${fx(F.lossPct, 1)}% of the 2000 forest)` : ''}; ${fx(F.lastLoss, 1)} km² in ${F.lossYear}. Area burned in ${R.year}: <b>${isNum(bThis) ? fx(bThis) + ' km²' : 'no data'}</b>${isNum(F.bAvg) ? ` against a usual ${fx(F.bAvg)} km²` : ''}${R.isCurrent && c.burned_to ? ` (data to ${ymTxt(c.burned_to)})` : ''}. Cropland ${isNum(F.c0) && F.c0 > 0 ? `changed by ${sgn((F.c1 / F.c0 - 1) * 100)}% between ${F.cy[0]} and ${F.cy[F.cy.length - 1]} (MODIS land cover)` : 'trend not available'}.</p>`)); } }
  if (on('risk') && R.risk) parts.push(sec(n++, 'Agricultural risk', `<table class="rtab"><thead><tr><th>Risk</th><th>Score (0–100)</th><th>Level</th></tr></thead><tbody>${[['drought', 'Drought'], ['flood', 'Flood'], ['degradation', 'Land degradation'], ['production', 'Production'], ['composite', 'Composite']].map(([k, l]) => `<tr${k === 'composite' ? ' class="tot"' : ''}><td>${l}</td><td>${fx(R.risk[k])}</td><td>${level(R.risk[k])[0]}</td></tr>`).join('')}</tbody></table><p class="rcap">Transparent indices combining drought index, rainfall, dry spells, surface water, greening trend and vegetation condition. Indicators for discussion, not validated predictions.</p>`));
  if (on('table') && rows) { const feats = R.national ? D.geo.features : (D.dgeo ? D.dgeo.features.filter(f => f.properties.region === (R.level === 'district' ? R.region : R.key)) : []);
    const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
    parts.push(sec(n++, R.national ? 'Regions at a glance' : R.level === 'district' ? `Districts of ${esc((summary(R.region) || {}).name || '')} Region` : 'Districts at a glance', `<div class="rgrid map">${feats.length ? `<div>${mapSVG(feats, f => { const r = byKey[f.properties.key]; return r && isNum(r.risk) ? riskFill(r.risk) : '#D5DBD3'; }, R.level === 'district' ? R.key : null, 'Risk map')}${RISK_LEG()}<p class="rcap">Composite risk, ${R.year}.</p></div>` : ''}
      <table class="rtab small"><thead><tr><th>${R.national ? 'Region' : 'District'}</th><th>Rain</th><th>VCI</th><th>SPI-3</th><th>Risk</th><th>Status</th></tr></thead><tbody>${[...rows].sort((a, b) => (b.risk ?? -1) - (a.risk ?? -1)).map(r => `<tr${R.level === 'district' && r.key === R.key ? ' class="tot"' : ''}><td>${esc(r.name)}</td><td>${isNum(r.rain) ? sgn(r.rain) + '%' : '–'}</td><td>${fx(r.vci)}</td><td>${sgn(r.spi, 1)}</td><td>${fx(r.risk)}</td><td>${esc(r.status || '–')}</td></tr>`).join('')}</tbody></table></div>`)); }
  if (REP.notes.trim()) parts.push(sec(n++, 'Observations and recommendations', `<div class="rnotes">${esc(REP.notes).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>').replace(/^/, '<p>').replace(/$/, '</p>')}</div>`));
  parts.push(sec(n++, 'Data and method', `<p class="rsmall">Rainfall: CHIRPS v3 (UCSB Climate Hazards Center), normals 1991–2020. Drought: Standardised Precipitation Index (McKee et al., 1993). Vegetation: MODIS NDVI (NASA), condition index after Kogan (1995). Temperature: ERA5-Land (ECMWF). Water: Sentinel-1 (ESA Copernicus) and JRC Global Surface Water. Soil: iSDAsoil. Land cover: ESA WorldCover 2021. Boundaries: geoBoundaries. Processed with Google Earth Engine. Full methods: ${esc(location.origin + location.pathname)}#methods</p>
    <p class="rsmall">These indicators are produced automatically from open satellite and climate data and have not been validated against field observations. Use them alongside local knowledge and official sources such as the Ghana Meteorological Agency and the Ministry of Food and Agriculture.</p>`));
  const by = [REP.byName, REP.byRole, REP.byOrg, REP.byContact].some(v => v.trim());
  const sign = `<section class="rsec rsign"><div><h3>Prepared by</h3>${by ? `<p><b>${esc(REP.byName)}</b>${REP.byRole ? '<br>' + esc(REP.byRole) : ''}${REP.byOrg ? '<br>' + esc(REP.byOrg) : ''}${REP.byContact ? '<br>' + esc(REP.byContact) : ''}</p>` : '<p class="blank">Name<br>Position<br>Organisation</p>'}<div class="sigline">Signature</div></div>
    <div><h3>Prepared for</h3><p>${REP.forOrg ? esc(REP.forOrg) : '<span class="blank">–</span>'}</p><h3>Date</h3><p>${today}</p>${REP.ref ? `<h3>Reference</h3><p>${esc(REP.ref)}</p>` : ''}</div></section>`;
  return `<article class="rdoc" id="rdoc">
    <header class="rhead"><div class="rbrand"><img src="assets/logo-mark.svg" alt="" width="40" height="40"><div><b>AgroIntel Africa</b><span>Agricultural intelligence from open satellite data</span></div></div>${REP.logo ? `<img class="ulogo" src="${REP.logo}" alt="Organisation logo">` : ''}</header>
    <div class="rtitle"><span class="rkick">${R.national ? 'National' : R.level === 'district' ? 'District' : 'Regional'} report${REP.ref ? ' · ' + esc(REP.ref) : ''}</span><h1>${esc(title)}</h1>
      <p>${place}<br>Period: ${period}<br>Generated ${today}${REP.forOrg ? ' for ' + esc(REP.forOrg) : ''}</p></div>
    ${parts.join('')}${sign}
    <footer class="rfoot">AgroIntel Africa · ${esc(location.host + location.pathname)} · a noncommercial portfolio project${D.meta.sample ? ' · SAMPLE DATA' : ''}</footer>
  </article>`;
}

async function reportView() {
  const view = $('#view');
  const lvl = curLevel(), unitName = state.district ? (sumUnit('district', state.district) || {}).name : (summary(state.region) || {}).name;
  if (REP.scope === 'unit' && !unitName) REP.scope = 'national';
  const f = (id, label, ph, type = 'text') => `<label class="rf"><span>${label}</span><input type="${type}" id="${id}" value="${esc(REP[id])}" placeholder="${esc(ph)}"></label>`;
  view.innerHTML = `<div class="mhead noprint"><span class="crumb">Reports · ${state.year} season</span><h1>Create a report</h1><div class="kente thin"></div></div>
  <div class="rbuild">
    <form class="panel rform noprint" id="rform" onsubmit="return false">
      <fieldset><legend>Area</legend>
        <label class="rr"><input type="radio" name="scope" value="unit"${REP.scope === 'unit' ? ' checked' : ''}> ${esc(unitName || '')}${lvl === 'district' ? ' district' : ' Region'}</label>
        <label class="rr"><input type="radio" name="scope" value="national"${REP.scope === 'national' ? ' checked' : ''}> Ghana, all 16 regions</label>
        <p class="note">Change the region, district or season with the selectors at the top.</p></fieldset>
      <fieldset><legend>Sections</legend>${RSECT.map(([k, l]) => `<label class="rr"><input type="checkbox" name="sec" value="${k}"${REP.sections.includes(k) ? ' checked' : ''}> ${l}</label>`).join('')}</fieldset>
      <fieldset><legend>Report details</legend>${f('title', 'Title (optional)', 'Leave blank for an automatic title')}${f('ref', 'Reference number (optional)', 'e.g. NR/AGR/2026/014')}${f('forOrg', 'Prepared for', 'e.g. Regional Department of Agriculture')}</fieldset>
      <fieldset><legend>Your details</legend>${f('byName', 'Name', 'Full name')}${f('byRole', 'Position', 'e.g. Agricultural Extension Officer')}${f('byOrg', 'Organisation', 'Organisation name')}${f('byContact', 'Contact', 'Email or phone')}
        <label class="rf"><span>Organisation logo (optional)</span><input type="file" id="logoIn" accept="image/png,image/jpeg,image/svg+xml"></label>${REP.logo ? '<button type="button" class="btn sm" id="logoRm">Remove logo</button>' : ''}
        <label class="rf"><span>Observations and recommendations</span><textarea id="notes" rows="6" placeholder="Your own findings, field observations or advice. Appears as its own section.">${esc(REP.notes)}</textarea></label>
        <label class="rr"><input type="checkbox" id="remember"${REP.remember ? ' checked' : ''}> Remember my details on this device</label></fieldset>
      <button type="button" class="btn primary rprint" id="rprint">Print or save as PDF</button>
      <p class="note">Your details and logo stay in this browser; nothing is uploaded. In the print dialog choose “Save as PDF” and A4.</p>
    </form>
    <div class="rpaper" id="rpaper"><p class="loading">Building report…</p></div>
  </div>`;
  const persist = () => store.set('agrointel.report', REP.remember ? REP : { ...RDEF, sections: REP.sections, scope: REP.scope, remember: false });
  let R = null;
  const draw = () => { if (R) $('#rpaper').innerHTML = reportDoc(R); };
  const load = async () => {
    try {
      if (REP.scope === 'national') R = await nationalView(state.year);
      else { const U = await unitData(lvl, curKey()); R = asView(U, state.year); }
      if (!R) { $('#rpaper').innerHTML = `<p class="loading">No data for ${state.year}.</p>`; return; }
      draw();
    } catch (e) { $('#rpaper').innerHTML = `<p class="loading">Could not build the report (${esc(e.message)}).</p>`; }
  };
  const form = $('#rform');
  form.addEventListener('input', e => {
    const t = e.target;
    if (t.name === 'scope') { REP.scope = t.value; persist(); load(); return; }
    if (t.name === 'sec') REP.sections = $$('#rform [name=sec]:checked').length ? [...$$('#rform [name=sec]:checked')].map(x => x.value) : [];
    else if (t.id === 'remember') REP.remember = t.checked;
    else if (t.id in REP && t.type !== 'file') REP[t.id] = t.value;
    persist(); draw();
  });
  $('#logoIn').onchange = e => { const file = e.target.files[0]; if (!file) return;
    if (file.size > 600 * 1024) { alertLine('Logo is over 600 KB; please use a smaller image.'); return; }
    const rd = new FileReader(); rd.onload = () => { REP.logo = rd.result; persist(); reportView(); }; rd.readAsDataURL(file); };
  const rm = $('#logoRm'); if (rm) rm.onclick = () => { REP.logo = ''; persist(); reportView(); };
  $('#rprint').onclick = () => { if (R) window.print(); };
  let ps = document.getElementById('rpage'); if (!ps) { ps = document.createElement('style'); ps.id = 'rpage'; document.head.appendChild(ps); }
  const foot = `AgroIntel Africa · ${location.host}${location.pathname}${D.meta.sample ? ' · SAMPLE DATA' : ''}`.replace(/["\\]/g, '');
  ps.textContent = `@page{@bottom-left{content:"${foot}";font:9px sans-serif;color:#4D5E55}@bottom-right{content:"Page " counter(page) " of " counter(pages);font:9px sans-serif;color:#4D5E55}}`;
  await load();
}
function alertLine(msg) { const p = document.createElement('p'); p.className = 'note warnline'; p.textContent = msg; $('#rform').prepend(p); setTimeout(() => p.remove(), 5000); }

/* ---------------- my workspace (stored in this browser; export/import to move it) ---------------- */
const ROLES = {
  extension: { label: 'Extension officer or district agriculture office', short: 'Extension', th: { spi: -1, vci: 35, risk: 60, res: 80 },
    focus: [['crop', 'season', 'Season assessment'], ['climate', 'ind', 'Onset, cessation and dry spells'], ['crop', 'soil', 'Soil and land'], ['farms', 'trace', 'Map a farmer\'s field']] },
  insurer: { label: 'Insurer or lender', short: 'Insurance and finance', th: { spi: -1.5, vci: 25, risk: 70, res: 70 },
    focus: [['climate', 'drought', 'Drought index (SPI-3)'], ['climate', 'rain', 'Rainfall against normal'], ['risk', 'summary', 'Risk summary'], ['farms', 'list', 'Monitored farms']] },
  water: { label: 'Irrigation or water manager', short: 'Water', th: { spi: -1, vci: 30, risk: 70, res: 80 },
    focus: [['water', 'res', 'Reservoir levels'], ['water', 'stress', 'Water balance'], ['climate', 'rain', 'Rainfall against normal'], ['water', 'surface', 'Surface water map']] },
  ngo: { label: 'NGO or development programme', short: 'Programmes', th: { spi: -1, vci: 30, risk: 60, res: 70 },
    focus: [['risk', 'summary', 'Risk summary'], ['crop', 'health', 'Vegetation health'], ['climate', 'ind', 'Rainy season timing'], ['crop', 'suit', 'Crop suitability']] },
  research: { label: 'Researcher or student', short: 'Research', th: { spi: -1, vci: 30, risk: 70, res: 70 },
    focus: [['climate', 'drought', 'Drought index (SPI-3)'], ['climate', 'temp', 'Temperature trend'], ['crop', 'health', 'Vegetation condition'], ['crop', 'soil', 'Soil profile']] },
  farmer: { label: 'Farmer or farmer group', short: 'Farming', th: { spi: -1, vci: 35, risk: 60, res: 80 },
    focus: [['farms', 'trace', 'Map my field'], ['climate', 'ind', 'When the rains start'], ['crop', 'suit', 'Which crops suit here'], ['crop', 'soil', 'My soil']] },
};
const WS_KEY = 'agrointel.workspace';
let WS = store.get(WS_KEY, null);
const wsSave = () => { WS.updated = new Date().toISOString(); store.set(WS_KEY, WS); };
const areaName = a => a.level === 'district' ? ((sumUnit('district', a.key) || {}).name || a.key) : `${(summary(a.key) || {}).name || a.key} Region`;
const areaRegion = a => a.level === 'district' ? (sumUnit('district', a.key) || {}).region : a.key;
const hello = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

function wsAlerts(a, th) {
  const b = sumYear(a.level, a.key, D.meta.year); if (!b) return [];
  const out = [];
  if (isNum(b.spi3) && b.spi3 <= th.spi) out.push(['bad', `Drought index ${sgn(b.spi3, 1)}`]);
  if (isNum(b.vci) && b.vci < th.vci) out.push(['warn', `Vegetation condition ${fx(b.vci)}`]);
  if (b.risk && isNum(b.risk.composite) && b.risk.composite >= th.risk) out.push(['bad', `Risk ${b.risk.composite}/100`]);
  if (b.status === 'Stressed') out.push(['warn', 'Season stressed']);
  return out;
}

function wsSetup() {
  const w = WS || { role: '', name: '', position: '', org: '', contact: '', areas: [], reservoirs: [], th: null };
  const opts = [...D.meta.regions.map(r => ({ level: 'region', key: r.key, label: `${r.name} Region`, sub: 'Region' })),
    ...(D.sum.district ? D.sum.district.units.map(u => ({ level: 'district', key: u.key, label: u.name, sub: `${(summary(u.region) || {}).name || ''} Region` })) : [])]
    .sort((a, b) => a.label.localeCompare(b.label));
  const picked = new Set(w.areas.map(a => a.level + ':' + a.key));
  const th = w.th || (ROLES[w.role] || ROLES.extension).th;
  return `<div class="mhead"><span class="crumb">My workspace</span><h1>${WS ? 'Edit your workspace' : 'Set up your workspace'}</h1><div class="kente thin"></div></div>
  <form class="panel wsform" id="wsform" onsubmit="return false">
    <p class="note">Your workspace is saved in this browser only; nothing is sent anywhere. Use “Export” on the workspace page to move it to another device.</p>
    <fieldset><legend>1 · What best describes your work?</legend><div class="roles">${Object.entries(ROLES).map(([k, r]) => `<label class="role"><input type="radio" name="role" value="${k}"${w.role === k ? ' checked' : ''} required><span>${r.label}</span></label>`).join('')}</div></fieldset>
    <fieldset><legend>2 · Areas you follow <small id="nPicked">(${picked.size} chosen, up to 12)</small></legend>
      <input type="search" id="areaQ" class="wsq" placeholder="Search regions and districts, e.g. Tolon or Upper East" aria-label="Search areas">
      <div class="arealist" id="areaList">${opts.map(o => `<label class="ar" data-q="${esc((o.label + ' ' + o.sub).toLowerCase())}"><input type="checkbox" name="area" value="${o.level}:${o.key}"${picked.has(o.level + ':' + o.key) ? ' checked' : ''}><span>${esc(o.label)}</span><small>${esc(o.sub)}</small></label>`).join('')}</div></fieldset>
    ${D.res ? `<fieldset><legend>3 · Reservoirs to watch (optional)</legend><div class="chips">${D.res.items.map(i => `<label class="rchip"><input type="checkbox" name="res" value="${i.key}"${w.reservoirs.includes(i.key) ? ' checked' : ''}> ${esc(i.name)}</label>`).join('')}</div></fieldset>` : ''}
    <fieldset><legend>${D.res ? 4 : 3} · Alert me when</legend><div class="ths">
      <label class="rf"><span>Drought index (SPI-3) falls to or below</span><input type="number" step="0.1" id="thSpi" value="${th.spi}"></label>
      <label class="rf"><span>Vegetation condition (VCI) drops below</span><input type="number" step="1" id="thVci" value="${th.vci}"></label>
      <label class="rf"><span>Composite risk reaches</span><input type="number" step="1" id="thRisk" value="${th.risk}"></label>
      <label class="rf"><span>A reservoir falls below this % of usual</span><input type="number" step="5" id="thRes" value="${th.res}"></label></div>
      <p class="note">Choosing a role fills in typical thresholds; change them if you like.</p></fieldset>
    <fieldset><legend>${D.res ? 5 : 4} · Your details (optional, used on reports)</legend><div class="ths">
      <label class="rf"><span>Name</span><input id="wsName" value="${esc(w.name)}"></label><label class="rf"><span>Position</span><input id="wsPos" value="${esc(w.position)}"></label>
      <label class="rf"><span>Organisation</span><input id="wsOrg" value="${esc(w.org)}"></label><label class="rf"><span>Contact</span><input id="wsContact" value="${esc(w.contact)}"></label></div></fieldset>
    <p class="warnline" id="wsErr" hidden></p>
    <div class="wsact"><button type="button" class="btn primary" id="wsSaveB">Save workspace</button>${WS ? '<a class="btn" href="#workspace" id="wsCancel">Cancel</a>' : ''}</div>
  </form>`;
}
function afterWsSetup() {
  const list = $$('#areaList .ar');
  $('#areaQ').oninput = e => { const q = e.target.value.trim().toLowerCase(); list.forEach(l => l.hidden = q && !l.dataset.q.includes(q)); };
  const count = () => { const n = $$('#wsform [name=area]:checked').length; $('#nPicked').textContent = `(${n} chosen, up to 12)`; return n; };
  $('#areaList').onchange = e => { if (count() > 12) { e.target.checked = false; count(); } };
  $$('#wsform [name=role]').forEach(r => r.onchange = () => { const t = ROLES[r.value].th; $('#thSpi').value = t.spi; $('#thVci').value = t.vci; $('#thRisk').value = t.risk; $('#thRes').value = t.res; });
  $('#wsSaveB').onclick = () => {
    const role = ($('#wsform [name=role]:checked') || {}).value, areas = [...$$('#wsform [name=area]:checked')].map(x => { const [level, key] = x.value.split(':'); return { level, key }; });
    const err = $('#wsErr');
    if (!role || !areas.length) { err.hidden = false; err.textContent = !role ? 'Choose the description that fits your work.' : 'Choose at least one region or district.'; return; }
    const num = (id, d) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : d; }, t = ROLES[role].th;
    WS = { v: 1, role, areas, reservoirs: [...$$('#wsform [name=res]:checked')].map(x => x.value),
      th: { spi: num('#thSpi', t.spi), vci: num('#thVci', t.vci), risk: num('#thRisk', t.risk), res: num('#thRes', t.res) },
      name: $('#wsName').value.trim(), position: $('#wsPos').value.trim(), org: $('#wsOrg').value.trim(), contact: $('#wsContact').value.trim(),
      created: (WS && WS.created) || new Date().toISOString() };
    wsSave();
    // carry the details into the report builder where it has none yet
    [['byName', 'name'], ['byRole', 'position'], ['byOrg', 'org'], ['byContact', 'contact']].forEach(([r, w]) => { if (!REP[r] && WS[w]) REP[r] = WS[w]; });
    store.set('agrointel.report', REP);
    location.hash = 'workspace'; route();
  };
}

function wsView() {
  if (!WS || state.wsEdit) return wsSetup();
  const role = ROLES[WS.role] || ROLES.extension, th = WS.th || role.th;
  const cards = WS.areas.map(a => {
    const b = sumYear(a.level, a.key, D.meta.year) || {}, al = wsAlerts(a, th);
    return `<article class="wscard${al.length ? ' wsalert' : ''}"><div class="wsc-head"><div><h3>${esc(areaName(a))}</h3><small>${a.level === 'district' ? esc((summary(areaRegion(a)) || {}).name || '') + ' Region' : 'Region'}</small></div>${b.status ? chip(b.status, statusCls(b.status)) : ''}</div>
      <div class="wsc-facts"><span><small>Rain</small><b>${isNum(b.rain_anom) ? sgn(b.rain_anom) + '%' : '–'}</b></span><span><small>SPI-3</small><b>${sgn(b.spi3, 1)}</b></span><span><small>VCI</small><b>${fx(b.vci)}</b></span><span><small>Risk</small><b>${fx(b.risk && b.risk.composite)}</b></span></div>
      ${al.length ? `<div class="wsc-al">${al.map(([c, t]) => chip(t, c)).join('')}</div>` : '<p class="wsc-ok">No alerts at your thresholds.</p>'}
      <div class="wsc-act"><button type="button" class="linkb" data-open="${a.level}:${a.key}">Open in dashboard</button><button type="button" class="linkb" data-rep="${a.level}:${a.key}">Create report</button></div></article>`; }).join('');
  const resCards = D.res ? WS.reservoirs.map(k => D.res.items.find(i => i.key === k)).filter(Boolean).map(it => { const t = it.stats || {}, low = isNum(t.pct_normal) && t.pct_normal < th.res;
    return `<article class="wscard${low ? ' wsalert' : ''}"><div class="wsc-head"><div><h3>${esc(it.name)}</h3><small>Reservoir · ${esc(resRegion(it))}</small></div>${t.status ? chip(t.status, resCls(t.status)) : ''}</div>
      <div class="wsc-facts"><span><small>Area</small><b>${isNum(t.area_km2) ? fx(t.area_km2, t.area_km2 < 100 ? 1 : 0) : '–'}</b></span><span><small>% usual</small><b>${isNum(t.pct_normal) ? t.pct_normal : '–'}</b></span><span><small>% full</small><b>${isNum(t.fill_pct) ? t.fill_pct : '–'}</b></span><span><small>Month</small><b>${t.latest_month ? MON[Number(t.latest_month.slice(5)) - 1] : '–'}</b></span></div>
      ${low ? `<div class="wsc-al">${chip(`Below ${th.res}% of usual`, 'bad')}</div>` : '<p class="wsc-ok">No alerts at your thresholds.</p>'}
      <div class="wsc-act"><button type="button" class="linkb" data-resopen="${it.key}">Open reservoir</button></div></article>`; }).join('') : '';
  const nAl = WS.areas.reduce((n, a) => n + (wsAlerts(a, th).length ? 1 : 0), 0) + (D.res ? WS.reservoirs.filter(k => { const t = (D.res.items.find(i => i.key === k) || {}).stats || {}; return isNum(t.pct_normal) && t.pct_normal < th.res; }).length : 0);
  return `<div class="mhead"><span class="crumb">My workspace · ${esc(role.short)}</span><h1>${hello()}${WS.name ? ', ' + esc(WS.name.split(' ')[0]) : ''}.</h1><div class="kente thin"></div></div>
  <div class="panel wstop"><div><h2>${nAl ? `${nAl} of your ${WS.areas.length + WS.reservoirs.length} watched places need attention` : `All ${WS.areas.length + WS.reservoirs.length} watched places are within your thresholds`}</h2>
    <p class="note">${D.meta.year} season · rainfall to ${fmtDate(D.meta.rain_latest)} · updated every Monday. Alerts use your thresholds: SPI-3 ≤ ${th.spi}, VCI &lt; ${th.vci}, risk ≥ ${th.risk}${WS.reservoirs.length ? `, reservoirs &lt; ${th.res}% of usual` : ''}.</p></div>
    <div class="wsbtns"><button type="button" class="btn" id="wsEdit">Edit</button><button type="button" class="btn" id="wsCsv">Download data (CSV)</button><button type="button" class="btn" id="wsExp">Export</button><label class="btn">Import<input type="file" id="wsImp" accept="application/json,.json" hidden></label></div></div>
  <div class="wsgrid">${cards}${resCards}</div>
  <section class="panel"><h2 style="font-size:20px">Useful for ${esc(role.short.toLowerCase())}</h2><div class="wslinks">${role.focus.map(([m, s, l]) => `<button type="button" class="wslink" data-go="${m}:${s}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[m]}</svg>${esc(l)}</button>`).join('')}<button type="button" class="wslink" data-go="report:"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON.report}</svg>Print a report</button></div></section>
  <p class="disclaimer">Saved in this browser on ${fmtDate((WS.updated || WS.created || '').slice(0, 10))}. Clearing your browser data deletes it, so export a copy. <button type="button" class="linkb" id="wsDel">Delete workspace</button></p>`;
}
function afterWs() {
  if (!WS || state.wsEdit) { afterWsSetup(); return; }
  const pick = v => { const [level, key] = v.split(':'); if (level === 'district') { state.district = key; state.region = (sumUnit('district', key) || {}).region || state.region; } else { state.region = key; state.district = null; } state.year = D.meta.year; save(); syncPickers(); };
  $$('[data-open]').forEach(b => b.onclick = () => { pick(b.dataset.open); location.hash = 'overview'; });
  $$('[data-rep]').forEach(b => b.onclick = () => { pick(b.dataset.rep); REP.scope = 'unit'; store.set('agrointel.report', REP); location.hash = 'report'; });
  $$('[data-resopen]').forEach(b => b.onclick = () => { const it = D.res.items.find(i => i.key === b.dataset.resopen); state.res = it.key; if (it.region) { state.region = it.region; state.district = null; } state.sub.water = 'res'; save(); syncPickers(); location.hash = 'water'; });
  $$('[data-go]').forEach(b => b.onclick = () => { const [m, s] = b.dataset.go.split(':'); const a = WS.areas[0]; if (a) pick(a.level + ':' + a.key); if (s) state.sub[m] = s; save(); location.hash = m; });
  $('#wsEdit').onclick = () => { state.wsEdit = true; renderView('workspace'); };
  $('#wsExp').onclick = () => download(`agrointel-workspace-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(WS, null, 2), 'application/json');
  $('#wsImp').onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
    rd.onload = () => { try { const w = JSON.parse(rd.result); if (!w || !ROLES[w.role] || !Array.isArray(w.areas)) throw new Error('not a workspace file');
      WS = { ...w, areas: w.areas.filter(a => a && (a.level === 'region' ? summary(a.key) : sumUnit('district', a.key))).slice(0, 12), reservoirs: Array.isArray(w.reservoirs) ? w.reservoirs : [] }; wsSave(); renderView('workspace');
    } catch (err) { alertBox(`Could not import: ${err.message}.`); } }; rd.readAsText(f); };
  $('#wsCsv').onclick = () => {
    const rows = [['level', 'key', 'name', 'region', 'year', 'rain_anomaly_pct', 'vci', 'spi3', 'risk_composite', 'risk_drought', 'risk_flood', 'status']];
    WS.areas.forEach(a => { const u = a.level === 'district' ? sumUnit('district', a.key) : sumUnit('region', a.key); if (!u) return;
      Object.entries(u.years).sort().forEach(([y, b]) => rows.push([a.level, a.key, u.name, u.region, y, b.rain_anom, b.vci, b.spi3, b.risk && b.risk.composite, b.risk && b.risk.drought, b.risk && b.risk.flood, b.status])); });
    let csv = rows.map(r => r.map(v => v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
    if (D.res && WS.reservoirs.length) { csv += '\n\nreservoir,month,area_km2\n' + WS.reservoirs.flatMap(k => { const it = D.res.items.find(i => i.key === k); return it ? Object.entries(it.series).map(([ym, v]) => `${it.name},${ym},${v}`) : []; }).join('\n'); }
    download(`agrointel-data-${new Date().toISOString().slice(0, 10)}.csv`, csv + `\n\n# Source: AgroIntel Africa (${location.host}${location.pathname}), indicators from CHIRPS, MODIS, ERA5-Land, Sentinel-1; not field-validated.\n`, 'text/csv');
  };
  $('#wsDel').onclick = e => { if (e.target.dataset.armed) { WS = null; try { localStorage.removeItem(WS_KEY); } catch (x) { /* storage unavailable */ } renderView('workspace'); } else { e.target.dataset.armed = '1'; e.target.textContent = 'Click again to delete'; } };
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function alertBox(msg) { const p = document.createElement('p'); p.className = 'note warnline'; p.textContent = msg; $('#view').prepend(p); setTimeout(() => p.remove(), 6000); }

/* ---------------- compare: two places or two seasons ---------------- */
let CMP = Object.assign({ mode: 'places', b: null, yb: null }, store.get('agrointel.compare', {}));
const CA = '#0C482E', CB = '#E8792B';
function pairBars(a, b, normal) {
  const W = 720, H = 220, L = 40, R = 8, T = 12, B = 22, iw = W - L - R, ih = H - T - B;
  const mx = niceMax(Math.max(1, ...a.filter(isNum), ...b.filter(isNum), ...normal.filter(isNum))), band = iw / 12; let s = '';
  for (let k = 0; k <= 2; k++) { const v = mx * k / 2, y = T + ih - ih * k / 2; s += `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="ax" x="${L - 5}" y="${y + 3}" text-anchor="end">${Math.round(v)}</text>`; }
  for (let i = 0; i < 12; i++) { const x = L + band * i;
    [[a[i], CA, .14], [b[i], CB, .5]].forEach(([v, c, off]) => { if (!isNum(v)) return; const h = ih * v / mx;
      s += `<rect x="${(x + band * off).toFixed(1)}" y="${(T + ih - h).toFixed(1)}" width="${(band * .34).toFixed(1)}" height="${Math.max(h, .8).toFixed(1)}" rx="1.5" fill="${c}"><title>${MON[i]}: ${fx(v)} mm</title></rect>`; });
    if (isNum(normal[i])) { const y = T + ih - ih * normal[i] / mx; s += `<line x1="${(x + band * .08).toFixed(1)}" x2="${(x + band * .92).toFixed(1)}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="3 2"/>`; }
    s += `<text class="ax" x="${(x + band / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle">${MON[i]}</text>`; }
  return svg(W, H, s, 'Monthly rainfall, both sides');
}
function pairLines(a, b, o) {
  const W = o.w || 720, H = o.h || 200, L = 40, R = 12, T = 12, B = 22, iw = W - L - R, ih = H - T - B, all = [...a, ...b].filter(isNum);
  if (!all.length) return '<p class="note">No data.</p>';
  const mn = o.min ?? Math.min(...all), mx = o.max ?? Math.max(...all), xs = i => L + iw * i / 11, ys = v => T + ih - (v - mn) / (mx - mn) * ih; let s = '';
  for (let k = 0; k <= 3; k++) { const v = mn + (mx - mn) * k / 3, y = ys(v); s += `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="ax" x="${L - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end">${o.fmt(v)}</text>`; }
  if (o.zero) { const y = ys(0); s += `<line class="zero" x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }
  [[a, CA], [b, CB]].forEach(([vals, c]) => { let d = '', st = false; vals.forEach((v, i) => { if (!isNum(v)) { st = false; return; } d += (st ? 'L' : 'M') + xs(i).toFixed(1) + ' ' + ys(Math.max(mn, Math.min(mx, v))).toFixed(1); st = true; });
    if (d) s += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round"/>`; });
  MON.forEach((m, i) => s += `<text class="ax" x="${xs(i).toFixed(1)}" y="${H - 7}" text-anchor="middle">${W < 600 ? m[0] : m}</text>`);
  return svg(W, H, s, o.title);
}
const unitOpts = sel => [...D.meta.regions.map(r => [`region:${r.key}`, `${r.name} Region`]),
  ...(D.sum.district ? [...D.sum.district.units].sort((a, b) => a.name.localeCompare(b.name)).map(u => [`district:${u.key}`, `${u.name} (${(summary(u.region) || {}).name || ''})`]) : [])]
  .map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');

async function compareView() {
  const view = $('#view'), first = D.meta.first_year || D.meta.year;
  const aRef = `${curLevel()}:${curKey()}`;
  if (!CMP.b || CMP.b === aRef) CMP.b = aRef === 'region:northern' ? 'region:upper-east' : 'region:northern';
  if (!CMP.yb || CMP.yb === state.year) CMP.yb = state.year === 2015 ? D.meta.year : 2015;
  const yrs = Array.from({ length: D.meta.year - first + 1 }, (_, i) => D.meta.year - i);
  view.innerHTML = `<div class="mhead"><span class="crumb">Compare</span><h1>Compare ${CMP.mode === 'places' ? 'two places' : 'two seasons'}</h1><div class="kente thin"></div></div>
    <div class="panel cmpbar"><div class="subs" role="tablist" style="margin:0"><button class="sub" type="button" role="tab" data-mode="places" aria-selected="${CMP.mode === 'places'}">Two places</button><button class="sub" type="button" role="tab" data-mode="seasons" aria-selected="${CMP.mode === 'seasons'}">Two seasons</button></div>
      <div class="cmpsel"><span class="sw" style="background:${CA}"></span><b>${esc(curLevel() === 'district' ? (sumUnit('district', curKey()) || {}).name : (summary(curKey()) || {}).name + ' Region')}${CMP.mode === 'seasons' ? ', ' + state.year : ''}</b><small>from the selectors at the top</small></div>
      <div class="cmpsel"><span class="sw" style="background:${CB}"></span>${CMP.mode === 'places' ? `<select class="pick" id="cmpB" aria-label="Second place">${unitOpts(CMP.b)}</select>` : `<select class="pick" id="cmpY" aria-label="Second season">${yrs.map(y => `<option${y === CMP.yb ? ' selected' : ''}>${y}</option>`).join('')}</select>`}</div></div>
    <div id="cmpOut"><p class="loading">Loading…</p></div>`;
  $$('[data-mode]').forEach(b => b.onclick = () => { CMP.mode = b.dataset.mode; store.set('agrointel.compare', CMP); compareView(); });
  const sb = $('#cmpB'); if (sb) sb.onchange = e => { CMP.b = e.target.value; store.set('agrointel.compare', CMP); compareView(); };
  const sy = $('#cmpY'); if (sy) sy.onchange = e => { CMP.yb = Number(e.target.value); store.set('agrointel.compare', CMP); compareView(); };
  let A, B;
  try {
    const Ua = await unitData(curLevel(), curKey()); A = asView(Ua, state.year);
    if (CMP.mode === 'places') { const [lv, k] = CMP.b.split(':'); B = asView(await unitData(lv, k), state.year); }
    else B = asView(Ua, CMP.yb);
  } catch (e) { $('#cmpOut').innerHTML = `<p class="loading">Could not load (${esc(e.message)}).</p>`; return; }
  if (!A || !B) { $('#cmpOut').innerHTML = '<p class="loading">No data for one of the two choices.</p>'; return; }
  const nameOf = R => CMP.mode === 'seasons' ? String(R.year) : R.level === 'district' ? R.name : R.name + ' Region';
  const sameMonths = A.rain.last_month === B.rain.last_month;
  const rows = [
    ['Rainfall total', R => fx(R.rain.total) + ' mm', R => R.rain.total, ' mm', 0],
    ['Rainfall vs normal', R => sgn(R.rain.anomaly_pct) + '%', R => R.rain.anomaly_pct, ' pts', 0],
    ['Drought index (SPI-3)', R => `${sgn(R.rain.spi3_latest, 1)} · ${esc(R.rain.spi_class || '')}`, R => R.rain.spi3_latest, '', 1],
    ['Onset of rains', R => R.season.onset ? fmtDay(R.season.onset) : '–', R => R.season.onset ? doyOf(R.season.onset) : null, ' days', 0],
    ['End of rains', R => R.season.cessation ? fmtDay(R.season.cessation) : '–', R => R.season.cessation ? doyOf(R.season.cessation) : null, ' days', 0],
    ['Season length', R => isNum(R.season.los) ? R.season.los + ' days' : '–', R => R.season.los, ' days', 0],
    ['Rainy days', R => fx(R.season.rainy_days), R => R.season.rainy_days, '', 0],
    ['Dry spells (7+ days)', R => fx(R.season.dry_spells), R => R.season.dry_spells, '', 0],
    ['Vegetation condition (VCI)', R => `${fx(R.ndvi.vci)} · ${vciClass(R.ndvi.vci)[0]}`, R => R.ndvi.vci, '', 0],
    ['Composite risk', R => `${fx(R.risk.composite)} · ${level(R.risk.composite)[0]}`, R => R.risk.composite, '', 0],
    ['Drought risk', R => fx(R.risk.drought), R => R.risk.drought, '', 0],
    ['Flood risk', R => fx(R.risk.flood), R => R.risk.flood, '', 0],
    ['Area burned in the year', R => R.change && isNum(R.change.burned_km2[String(R.year)]) ? fx(R.change.burned_km2[String(R.year)]) + ' km²' : '–', R => R.change && R.change.burned_km2[String(R.year)], ' km²', 0],
    ['Season status', R => R.status || '–', () => null, '', 0],
  ];
  if (CMP.mode === 'places') rows.push(
    ['Normal annual rainfall', R => fx(R.rain.annual_normal) + ' mm', R => R.rain.annual_normal, ' mm', 0],
    ['Average temperature', R => fx(R.temp.normal, 1) + ' °C', R => R.temp.normal, ' °C', 1],
    ['Cropland share', R => R.land && isNum(R.land.cropland_pct) ? fx(R.land.cropland_pct, 0) + '%' : '–', R => R.land && R.land.cropland_pct, ' pts', 0],
    ['Tree cover lost since 2001', R => { const F = changeFacts(R); return F ? fx(F.lossTot, 1) + ' km²' + (isNum(F.lossPct) ? ` (${fx(F.lossPct, 1)}%)` : '') : '–'; }, R => { const F = changeFacts(R); return F ? F.lossTot : null; }, ' km²', 1],
    ['Topsoil pH', R => R.soil ? `${fx(R.soil.ph.value, 1)} · ${R.soil.ph.rating}` : '–', R => R.soil && R.soil.ph.value, '', 1],
    ['Best-suited crops', R => (R.suitability || []).filter(c => c.class === 'S1').map(c => c.name).slice(0, 4).join(', ') || '–', () => null, '', 0]);
  const diff = (f, u, d) => { const a = f(A), b = f(B); return isNum(a) && isNum(b) ? `${a - b > 0 ? '+' : a - b < 0 ? '−' : ''}${Math.abs(a - b).toFixed(d)}${u}` : ''; };
  const head = (() => { const a = A.rain.anomaly_pct, b = B.rain.anomaly_pct; if (!isNum(a) || !isNum(b)) return 'Side by side';
    const wetter = a > b ? nameOf(A) : nameOf(B), gap = Math.abs(a - b);
    return gap < 5 ? `${esc(nameOf(A))} and ${esc(nameOf(B))} had similar rainfall against normal` : `${esc(wetter)} was ${fx(gap)} points wetter against its normal`; })();
  $('#cmpOut').innerHTML = `<section class="panel">${verdict('', head, `${!sameMonths ? `Note: ${nameOf(A)} covers January–${MON[A.rain.last_month - 1]} and ${nameOf(B)} January–${MON[B.rain.last_month - 1]}, so totals are not like for like. ` : ''}Differences are ${esc(nameOf(A))} minus ${esc(nameOf(B))}.`)}
    <div class="rtable"><table class="rtab cmptab"><thead><tr><th>Indicator</th><th><span class="sw" style="background:${CA}"></span>${esc(nameOf(A))}</th><th><span class="sw" style="background:${CB}"></span>${esc(nameOf(B))}</th><th>Difference</th></tr></thead>
      <tbody>${rows.map(([l, f, n, u, d]) => `<tr><td>${l}</td><td>${f(A)}</td><td>${f(B)}</td><td class="mono">${diff(n, u, d)}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="panel"><h3 style="font-size:18px">Monthly rainfall</h3>${pairBars(A.rain.monthly, B.rain.monthly, CMP.mode === 'seasons' ? A.rain.normal : [])}
      <div class="cmpkey"><span><i style="background:${CA}"></i>${esc(nameOf(A))}</span><span><i style="background:${CB}"></i>${esc(nameOf(B))}</span>${CMP.mode === 'seasons' ? '<span><i class="dash"></i>1991–2020 normal</span>' : ''}</div></section>
    <div class="cmp2"><section class="panel"><h3 style="font-size:18px">Greenness (NDVI)</h3>${pairLines(A.ndvi.monthly, B.ndvi.monthly, { min: 0, max: .9, w: 420, h: 220, fmt: v => fx(v, 2), title: 'NDVI by month' })}</section>
      <section class="panel"><h3 style="font-size:18px">Drought index (SPI-3)</h3>${pairLines(A.rain.spi3, B.rain.spi3, { min: -3, max: 3, w: 420, h: 220, zero: true, fmt: v => (v > 0 ? '+' : '') + v, title: 'SPI-3 by month' })}</section></div>
    <p class="disclaimer">Indicators are computed automatically from open satellite and climate data and have not been validated in the field.</p>`;
}

/* ---------------- forecast, heat and farming advice (Open-Meteo, CC BY 4.0) ---------------- */
function unitCentre(R) {
  const f = R.level === 'district' ? districtFeature(R.key) : regionFeature(R.key); if (!f) return null;
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  let best = null, ba = -1;
  polys.forEach(p => { const r = p[0]; let a = 0, cx = 0, cy = 0;
    r.forEach((q, i) => { const n = r[(i + 1) % r.length], c = q[0] * n[1] - n[0] * q[1]; a += c; cx += (q[0] + n[0]) * c; cy += (q[1] + n[1]) * c; });
    if (Math.abs(a) > ba) { ba = Math.abs(a); best = [cy / (3 * a), cx / (3 * a)]; } });
  return best && best.map(v => Math.round(v * 100) / 100);
}
const FC_CACHE = {};
async function getForecast(lat, lon) {
  const k = `${lat},${lon}`, now = Date.now();
  if (FC_CACHE[k] && now - FC_CACHE[k].t < 3600e3) return FC_CACHE[k].d;
  try { const s = JSON.parse(sessionStorage.getItem('fc:' + k) || 'null'); if (s && now - s.t < 3600e3) { FC_CACHE[k] = s; return s.d; } } catch (e) { /* storage unavailable */ }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration&timezone=Africa%2FAccra&forecast_days=16`;
  const r = await fetch(url); if (!r.ok) throw new Error('forecast service ' + r.status);
  const j = await r.json(), d = j.daily;
  const days = d.time.map((t, i) => ({ date: t, tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], rain: d.precipitation_sum[i] ?? 0, prob: d.precipitation_probability_max[i], et0: d.et0_fao_evapotranspiration[i] }));
  FC_CACHE[k] = { t: now, d: days };
  try { sessionStorage.setItem('fc:' + k, JSON.stringify(FC_CACHE[k])); } catch (e) { /* storage unavailable */ }
  return days;
}
const dayName = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
function fcSummary(days) {
  const w = days.slice(0, 7), sum = (a, k) => a.reduce((s, d) => s + (isNum(d[k]) ? d[k] : 0), 0);
  let run = 0, best = { len: 0, start: null }, start = null;
  days.forEach(d => { if (d.rain < 1) { if (!run) start = d.date; run++; if (run > best.len) best = { len: run, start }; } else run = 0; });
  const hot = days.filter(d => d.tmax >= 35), severe = days.filter(d => d.tmax >= 38), peak = days.reduce((a, d) => d.tmax > a.tmax ? d : a, days[0]);
  return { rain7: sum(w, 'rain'), rainDays7: w.filter(d => d.rain >= 1).length, rain16: sum(days, 'rain'), et07: sum(w, 'et0'),
    dry: best, hot, severe, peak, heavy: days.slice(0, 5).find(d => d.rain >= 20), flood: days.find(d => d.rain >= 50) };
}
function fcAdvice(R, S) {
  const out = [], m = new Date().getUTCMonth() + 1, doy = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5);
  const s = R.season || {}, onN = s.onset_normal_doy, ceN = s.cessation_normal_doy;
  const inSeason = s.onset && !s.cessation, preSeason = R.isCurrent && !s.onset && isNum(onN) && doy >= onN - 30 && doy <= onN + 75;
  const drySeason = !inSeason && !preSeason;
  if (preSeason) {
    if (S.dry.len >= 7) out.push(['warn', 'Hold off planting', `A dry spell of about ${S.dry.len} days is forecast from ${dayName(S.dry.start)}. Seedlings planted now could die before the rains settle.`]);
    else if (S.rain7 >= 20) out.push(['good', 'Planting window', `About ${fx(S.rain7)} mm of rain is forecast this week and no long dry spell after it. Plant once the topsoil is moist to a hand's depth.`]);
    else out.push(['mod', 'Wait for steadier rain', `Only ${fx(S.rain7)} mm is forecast this week. The rains usually settle around ${doyStr(onN)} here.`]);
  } else if (inSeason) {
    if (S.dry.len >= 7) out.push(['warn', 'Dry spell ahead', `About ${S.dry.len} dry days from ${dayName(S.dry.start)}. Mulch, weed early and irrigate high-value crops if you can.`]);
    else out.push(['good', 'Rain looks adequate', `${fx(S.rain7)} mm on ${S.rainDays7} days forecast this week.`]);
  } else {
    out.push(['mod', 'Dry season', `The main rains usually ${isNum(ceN) && doy > ceN ? `ended around ${doyStr(ceN)}` : 'have not started'}. Any crop now needs irrigation: see Water → Irrigation planner.`]);
  }
  if (S.flood) out.push(['bad', 'Very heavy rain', `${fx(S.flood.rain)} mm forecast on ${dayName(S.flood.date)}. Low-lying fields and riverbanks may flood; clear drains and move stored grain up.`]);
  if (S.heavy) out.push(['warn', 'Delay fertiliser and spraying', `Heavy rain (${fx(S.heavy.rain)} mm) on ${dayName(S.heavy.date)} would wash it off.`]);
  if (S.severe.length) out.push(['bad', 'Severe heat', `${S.severe.length} day${S.severe.length > 1 ? 's' : ''} at 38 °C or more, peaking at ${fx(S.peak.tmax)} °C on ${dayName(S.peak.date)}. Maize and tomato flowers can fail in this heat: irrigate early morning or evening, give livestock shade and water, avoid field work at midday.`]);
  else if (S.hot.length) out.push(['warn', 'Hot days', `${S.hot.length} day${S.hot.length > 1 ? 's' : ''} at 35 °C or more (peak ${fx(S.peak.tmax)} °C). Water in the cool hours and watch for wilting.`]);
  const def = S.et07 - S.rain7;
  out.push([def > 15 ? 'warn' : 'neu', 'Crop water this week', def > 0 ? `A crop in full leaf uses about ${fx(S.et07)} mm this week and the forecast rain gives ${fx(S.rain7)} mm, a shortfall of about ${fx(def)} mm. That is ${fx(def)} litres per square metre, or ${fx(def * 10)} m³ per hectare.` : `Forecast rain (${fx(S.rain7)} mm) covers what a crop in full leaf uses this week (${fx(S.et07)} mm).`]);
  return out;
}
function fcChart(days) {
  const W = 760, H = 230, L = 40, R = 40, T = 14, B = 34, iw = W - L - R, ih = H - T - B, band = iw / days.length;
  const rmx = niceMax(Math.max(20, ...days.map(d => d.rain))), tmn = 15, tmx = 45, ty = v => T + ih - (v - tmn) / (tmx - tmn) * ih; let s = '';
  for (let k = 0; k <= 2; k++) { const y = T + ih - ih * k / 2; s += `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="ax" x="${L - 5}" y="${y + 3}" text-anchor="end">${Math.round(rmx * k / 2)}</text><text class="ax" x="${W - R + 5}" y="${y + 3}">${tmn + (tmx - tmn) * k / 2}°</text>`; }
  s += `<line x1="${L}" x2="${W - R}" y1="${ty(35)}" y2="${ty(35)}" stroke="var(--bad)" stroke-dasharray="4 3" stroke-width="1.2"/><text class="ax" x="${W - R - 4}" y="${ty(35) - 4}" text-anchor="end" fill="var(--bad)">35 °C heat line</text>`;
  days.forEach((d, i) => { const x = L + band * i, h = ih * d.rain / rmx;
    s += `<rect x="${(x + band * .2).toFixed(1)}" y="${(T + ih - h).toFixed(1)}" width="${(band * .6).toFixed(1)}" height="${Math.max(h, .5).toFixed(1)}" rx="2" class="m-wet"${i >= 7 ? ' opacity=".55"' : ''}><title>${dayName(d.date)}: ${fx(d.rain, 1)} mm, ${fx(d.tmax)} °C</title></rect>`;
    const nm = new Date(d.date + 'T12:00:00Z');
    s += `<text class="ax" x="${(x + band / 2).toFixed(1)}" y="${H - 18}" text-anchor="middle">${nm.toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' })}</text><text class="ax" x="${(x + band / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${nm.getUTCDate()}</text>`; });
  s += `<path d="${days.map((d, i) => (i ? 'L' : 'M') + (L + band * (i + .5)).toFixed(1) + ' ' + ty(Math.min(tmx, Math.max(tmn, d.tmax))).toFixed(1)).join('')}" fill="none" stroke="var(--bad)" stroke-width="2.2"/>`;
  days.forEach((d, i) => s += `<circle cx="${(L + band * (i + .5)).toFixed(1)}" cy="${ty(Math.min(tmx, Math.max(tmn, d.tmax))).toFixed(1)}" r="${d.tmax >= 35 ? 3.6 : 2.4}" fill="var(--bad)"/>`);
  s += `<text class="ax" x="${L}" y="${T - 3}">mm</text>`;
  return svg(W, H, s, '16-day forecast: daily rain and maximum temperature');
}
VIEWS.climate.fc = R => P(`<div id="fcBox"><p class="loading">Loading the forecast…</p></div>`);
AFTER.climate.fc = async R => {
  const box = $('#fcBox'), c = unitCentre(R);
  if (!c) { box.innerHTML = '<p class="loading">No location for this area.</p>'; return; }
  let days; try { days = await getForecast(c[0], c[1]); } catch (e) { box.innerHTML = `<p class="loading">The forecast service could not be reached (${esc(e.message)}). Try again shortly.</p>`; return; }
  const S = fcSummary(days), adv = fcAdvice(R, S);
  const head = `Next 7 days: ${fx(S.rain7)} mm of rain on ${S.rainDays7} day${S.rainDays7 === 1 ? '' : 's'}, up to ${fx(Math.max(...days.slice(0, 7).map(d => d.tmax)))} °C`;
  box.innerHTML = `${verdict(chip(S.severe.length ? 'Heat alert' : S.dry.len >= 7 ? 'Dry spell ahead' : S.flood ? 'Heavy rain' : 'Forecast', S.severe.length || S.flood ? 'bad' : S.dry.len >= 7 || S.hot.length ? 'warn' : 'good'), head, `Forecast for the centre of ${esc(R.name)} (${c[0]}°, ${c[1]}°), updated hourly. Advice combines the forecast with this season's satellite record.`)}
    <div class="advice">${adv.map(([t, h, x]) => `<div class="adv ${t}"><b>${esc(h)}</b><p>${esc(x)}</p></div>`).join('')}</div>
    <div><h3 class="chh">16-day outlook</h3>${fcChart(days)}<div class="cmpkey"><span><i style="background:var(--water)"></i>Daily rain (paler: days 8–16, less certain)</span><span><i style="background:var(--bad)"></i>Maximum temperature</span></div></div>
    <div class="rtable"><table class="rtab small fctab"><thead><tr><th>Day</th><th>Rain</th><th>Chance</th><th>Max</th><th>Min</th><th>Crop water use</th></tr></thead><tbody>${days.slice(0, 10).map(d => `<tr${d.tmax >= 38 ? ' class="hotrow"' : ''}><td>${dayName(d.date)}</td><td>${fx(d.rain, 1)} mm</td><td>${isNum(d.prob) ? d.prob + '%' : '–'}</td><td>${fx(d.tmax)} °C</td><td>${fx(d.tmin)} °C</td><td>${fx(d.et0, 1)} mm</td></tr>`).join('')}</tbody></table></div>
    <p class="note">Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0), from national weather-model forecasts. Crop water use is reference evapotranspiration (FAO-56). Forecasts beyond about 7 days are uncertain; this is guidance, not an official warning: follow the Ghana Meteorological Agency for those.</p>`;
};

/* ---------------- irrigation planner (FAO-56 crop water need against reservoir water) ---------------- */
const IRR_CROPS = [
  { key: 'tomato', name: 'Tomato', kc: [0.6, 1.15, 0.8], st: [30, 40, 40, 25] },
  { key: 'onion', name: 'Onion', kc: [0.7, 1.05, 0.75], st: [15, 25, 70, 40] },
  { key: 'pepper', name: 'Pepper', kc: [0.6, 1.05, 0.9], st: [30, 35, 40, 20] },
  { key: 'leafy', name: 'Leafy vegetables', kc: [0.7, 1.0, 0.95], st: [20, 30, 15, 10] },
  { key: 'maize', name: 'Maize', kc: [0.3, 1.2, 0.6], st: [20, 35, 40, 30] },
  { key: 'rice', name: 'Rice (paddy)', kc: [1.05, 1.2, 0.9], st: [30, 30, 60, 30], paddy: true },
];
const IRR_EFF = [['Furrow or basin (50%)', 0.5], ['Sprinkler (70%)', 0.7], ['Drip (90%)', 0.9]];
let IRR = Object.assign({ crop: 'tomato', month: ((new Date().getUTCMonth() + 1) % 12) + 1, eff: 0.5, depth: 1.5, share: 60 }, store.get('agrointel.irr', {}));
function cropNeed(c, startMonth, pet, rain, eff) {
  // daily FAO-56 crop coefficient curve x monthly reference ET, minus effective rainfall; returns mm per month of season and totals
  const len = c.st.reduce((a, b) => a + b, 0), months = {}; let nir = 0, etc = 0, peff = 0;
  const kcAt = d => { const [a, b, cc] = c.st, [ki, km, ke] = c.kc;
    if (d < a) return ki; if (d < a + b) return ki + (km - ki) * (d - a) / b; if (d < a + b + cc) return km; return km + (ke - km) * (d - a - b - cc) / c.st[3]; };
  const y = 2025;
  for (let d = 0; d < len; d++) {
    const dt = new Date(Date.UTC(y, startMonth - 1, 1 + d)), mi = dt.getUTCMonth(), dim = new Date(Date.UTC(dt.getUTCFullYear(), mi + 1, 0)).getUTCDate();
    const P = rain[mi] || 0, pe = (P < 250 ? P * (125 - 0.2 * P) / 125 : 125 + 0.1 * P) / dim;
    const e = kcAt(d) * (pet[mi] || 0) / dim + (c.paddy ? 4 : 0);
    const need = Math.max(0, e - pe); nir += need; etc += e; peff += Math.min(pe, e);
    const k = MON[mi]; months[k] = months[k] || { need: 0, rain: 0, order: Object.keys(months).length }; months[k].need += e; months[k].rain += Math.min(pe, e);
  }
  if (c.paddy) nir += 150; // land soaking and puddling
  return { len, nir, gir: nir / eff, etc, peff, months };
}
VIEWS.water.irr = R => {
  if (!D.res || !D.res.items.length) return P(verdict(chip('Not yet', 'neu'), 'The irrigation planner needs reservoir data', 'It appears after the next pipeline run.'));
  const rk = R.level === 'district' ? R.region : R.key, items = [...D.res.items].sort((a, b) => (b.region === rk) - (a.region === rk));
  if (!items.find(i => i.key === state.res)) state.res = items[0].key;
  return P(`<div class="irrgrid"><form class="irrform" id="irrForm" onsubmit="return false">
      <label class="rf"><span>Reservoir</span><select class="pick" id="irrRes">${items.map(i => `<option value="${i.key}"${i.key === state.res ? ' selected' : ''}>${esc(i.name)} (${esc(resRegion(i))})</option>`).join('')}</select></label>
      <label class="rf"><span>Crop</span><select class="pick" id="irrCrop">${IRR_CROPS.map(c => `<option value="${c.key}"${c.key === IRR.crop ? ' selected' : ''}>${c.name}</option>`).join('')}</select></label>
      <label class="rf"><span>Planting month</span><select class="pick" id="irrMonth">${MONTH.map((m, i) => `<option value="${i + 1}"${i + 1 === IRR.month ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="rf"><span>Irrigation method</span><select class="pick" id="irrEff">${IRR_EFF.map(([l, v]) => `<option value="${v}"${v === IRR.eff ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="rf"><span>Usable water depth: <b id="irrDepthV">${IRR.depth} m</b></span><input type="range" id="irrDepth" min="0.5" max="4" step="0.25" value="${IRR.depth}"></label>
      <label class="rf"><span>Share of water for irrigation: <b id="irrShareV">${IRR.share}%</b></span><input type="range" id="irrShare" min="10" max="90" step="5" value="${IRR.share}"></label>
    </form><div id="irrOut"><p class="loading">Calculating…</p></div></div>
    <p class="note">Crop water need: FAO-56 crop coefficients × MODIS potential evapotranspiration (2001–2020 average for each month), minus effective rainfall from the 1991–2020 rainfall normal (USDA-SCS method). Paddy rice adds 4 mm/day percolation and 150 mm for land soaking. Water available: current open-water area × usable depth × irrigation share, minus open-water evaporation over the season. Area is measured; depth is your estimate, so treat results as a planning range, not a design.</p>`);
};
AFTER.water.irr = async R => {
  const calc = async () => {
    const it = D.res.items.find(i => i.key === state.res), c = IRR_CROPS.find(x => x.key === IRR.crop), st = it.stats || {};
    let U; try { U = await unitData('region', it.region || (R.level === 'district' ? R.region : R.key)); } catch (e) { U = null; }
    const V = U ? asView(U, U.current_year) : R;
    const pet = (V.balance && V.balance.pet) || [], rain = V.rain.normal;
    const need = cropNeed(c, IRR.month, pet, rain, IRR.eff);
    const area = st.area_km2 || 0, seasonPet = Object.values(need.months).length ? need.len / 30.4 * (pet.reduce((a, b) => a + b, 0) / 12) : 0;
    const store_m3 = area * 1e6 * IRR.depth * IRR.share / 100, evap_m3 = area * 1e6 * 0.8 * 1.05 * seasonPet / 1000 * IRR.share / 100;
    const avail = Math.max(0, store_m3 - evap_m3), perHa = need.gir * 10, ha = perHa > 0 ? avail / perHa : 0;
    const others = IRR_CROPS.map(x => { const n = cropNeed(x, IRR.month, pet, rain, IRR.eff); return [x.name, n.gir * 10 > 0 ? avail / (n.gir * 10) : 0, n.gir]; });
    const omax = Math.max(...others.map(o => o[1]), 1), mk = Object.entries(need.months).sort((a, b) => a[1].order - b[1].order);
    const mmax = niceMax(Math.max(...mk.map(([, v]) => v.need)) || 1);
    const big = ha >= 1000 ? fx(Math.round(ha / 100) * 100) : ha >= 100 ? fx(Math.round(ha / 10) * 10) : fx(ha, 0);
    $('#irrOut').innerHTML = `<div class="irrbig"><small>${esc(it.name)} could irrigate about</small><b>${Number(big.replace(/,/g, '')).toLocaleString('en-GB')} ha</b><span>of ${c.name.toLowerCase()} planted in ${MONTH[IRR.month - 1]}</span></div>
      <div class="facts">${fact('Water for irrigation', fx(avail / 1e6, 1) + 'M m³', `${fx(area, 1)} km² × ${IRR.depth} m × ${IRR.share}%, less evaporation`)}${fact('Water per hectare', Math.round(perHa).toLocaleString('en-GB') + ' m³', `${fx(need.gir)} mm over ${need.len} days`)}${fact('Rain does', fx(need.peff / need.etc * 100, 0) + '%', 'of the crop\'s water need in a normal year')}</div>
      <div><h3 class="chh">Monthly water need of the crop</h3><div class="irrbars">${mk.map(([m, v]) => `<div class="ib"><div class="ibcol"><span class="ibneed" style="height:${(v.need / mmax * 100).toFixed(1)}%"><span class="ibrain" style="height:${(v.rain / v.need * 100).toFixed(1)}%"></span></span></div><small>${m}</small><em>${fx(v.need)}</em></div>`).join('')}</div>
        <div class="cmpkey"><span><i style="background:var(--water)"></i>Covered by normal rainfall</span><span><i style="background:var(--sun)"></i>Must come from irrigation</span><span>mm per month</span></div></div>
      <div><h3 class="chh">Same water, other crops (${MONTH[IRR.month - 1]} planting)</h3><div class="hbars">${others.sort((a, b) => b[1] - a[1]).map(([n, h, g]) => `<div class="hb${n === c.name ? ' on' : ''}"><span>${esc(n)}</span><i style="width:${(h / omax * 100).toFixed(1)}%"></i><b>${h >= 100 ? fx(Math.round(h / 10) * 10) : fx(h, 0)} ha</b></div>`).join('')}</div></div>`;
  };
  const set = (k, v) => { IRR[k] = v; store.set('agrointel.irr', IRR); calc(); };
  $('#irrRes').onchange = e => { state.res = e.target.value; save(); calc(); };
  $('#irrCrop').onchange = e => set('crop', e.target.value);
  $('#irrMonth').onchange = e => set('month', Number(e.target.value));
  $('#irrEff').onchange = e => set('eff', Number(e.target.value));
  $('#irrDepth').oninput = e => { $('#irrDepthV').textContent = e.target.value + ' m'; set('depth', Number(e.target.value)); };
  $('#irrShare').oninput = e => { $('#irrShareV').textContent = e.target.value + '%'; set('share', Number(e.target.value)); };
  await calc();
};

/* ---------------- early warning (machine-learning model trained in the pipeline) ---------------- */
function ewFor(R) {
  const M = D.model; if (!M) return null;
  const keys = R.level === 'district' ? [R.key] : (D.sum.district ? D.sum.district.units.filter(u => u.region === R.key).map(u => u.key) : []);
  const now = keys.map(k => M.predicted[k]).filter(isNum), years = {};
  keys.forEach(k => Object.entries(M.backtest[k] || {}).forEach(([y, [p, o]]) => { (years[y] = years[y] || { p: [], o: [] }).p.push(p); years[y].o.push(o); }));
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  return { M, n: keys.length, now: now.length ? avg(now) : null, hist: Object.entries(years).sort().map(([y, v]) => [y, avg(v.p), avg(v.o)]) };
}
const ewLevel = p => !isNum(p) ? ['No prediction', 'neu'] : p >= .5 ? ['High chance of a poor season', 'bad'] : p >= .25 ? ['Elevated chance', 'warn'] : ['Low chance', 'good'];
VIEWS.risk.ew = R => {
  const E = ewFor(R); if (!E) return P(verdict(chip('Not yet', 'neu'), 'The early-warning model appears after the next pipeline run', 'It trains itself on every district\'s past seasons.'));
  const M = E.M, [lv, cls] = ewLevel(E.now), pct = isNum(E.now) ? Math.round(E.now * 100) : null;
  const live = new Date().getUTCMonth() + 1 <= M.target_months[1] && new Date().getUTCFullYear() === M.current_year;
  const W = 720, H = 170, L = 34, Rr = 8, T = 10, B = 22, iw = W - L - Rr, ih = H - T - B, band = iw / Math.max(1, E.hist.length); let s = '';
  [0, .5, 1].forEach(v => { const y = T + ih - ih * v; s += `<line class="grid-l" x1="${L}" x2="${W - Rr}" y1="${y}" y2="${y}"/><text class="ax" x="${L - 5}" y="${y + 3}" text-anchor="end">${v * 100}%</text>`; });
  E.hist.forEach(([y, p, o], i) => { const x = L + band * i, h = ih * p;
    s += `<rect x="${(x + band * .18).toFixed(1)}" y="${(T + ih - h).toFixed(1)}" width="${(band * .64).toFixed(1)}" height="${Math.max(h, .8).toFixed(1)}" rx="2" fill="${p >= .5 ? 'var(--bad)' : p >= .25 ? 'var(--warn)' : 'var(--leaf)'}"><title>${y}: predicted ${Math.round(p * 100)}%, ${o >= .5 ? 'poor season happened' : 'normal season'}</title></rect>`;
    if (o >= .5) s += `<circle cx="${(x + band / 2).toFixed(1)}" cy="${T + 6}" r="4.5" fill="var(--ink)"/>`;
    if (i % 3 === 0 || i === E.hist.length - 1) s += `<text class="ax" x="${(x + band / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${y}</text>`; });
  const wmax = Math.max(...M.coef.map(Math.abs));
  return P(`${verdict(chip(lv, cls), isNum(pct) ? `${pct}% chance that ${esc(R.name)}${R.level === 'region' ? ' Region' : ''} has a poor ${M.current_year} season` : 'No prediction for this year', `A poor season means crop greenness in ${MONTH[M.target_months[0] - 1]}–${MONTH[M.target_months[1] - 1]} among the worst fifth of years for that district. The model reads the season to the end of ${MONTH[M.cut_month - 1]}, about two months ahead${R.level === 'region' ? `; region figure is the average of its ${E.n} districts` : ''}. ${live ? '' : `For ${M.current_year} that window has passed: compare with Crop → Vegetation health.`}`)}
    <div class="facts">${fact('Tested accuracy', isNum(M.cv_accuracy) ? Math.round(M.cv_accuracy * 100) + '%' : '–', 'each year predicted without seeing it')}${fact('Skill (AUC)', fx(M.cv_auc, 2), '0.5 = guessing, 1 = perfect')}${fact('When it raises the alarm', isNum(M.top20_hit_rate) ? Math.round(M.top20_hit_rate * 100) + '%' : '–', `are real poor seasons (base rate ${Math.round(M.base_rate * 100)}%)`)}</div>
    <div><h3 class="chh">How the model would have called past seasons here</h3>${svg(W, H, s, 'Predicted chance of a poor season by year')}
      <div class="cmpkey"><span><i style="background:var(--bad)"></i>Predicted 50% or more</span><span><i style="background:var(--warn)"></i>25–50%</span><span><i style="background:var(--leaf)"></i>Under 25%</span><span><i style="background:var(--ink);border-radius:50%;width:9px;height:9px"></i>A poor season actually happened</span></div></div>
    <div class="split"><div><h3 class="chh">What drives the prediction</h3><p class="note" style="margin:0 0 8px">Bar length = how much each signal matters. Red: higher values make a poor season more likely; green: less likely.</p><div class="hbars ewbars">${M.features.map((f, i) => [M.labels[f], M.coef[i]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([l, c]) => `<div class="hb"><span>${esc(l)}</span><i style="width:${(Math.abs(c) / wmax * 100).toFixed(1)}%;background:${c > 0 ? 'var(--bad)' : 'var(--good)'}"></i></div>`).join('')}</div></div>
      <div><h3 class="chh">About the model</h3><p class="note" style="margin:0">Logistic regression trained on ${M.n.toLocaleString('en-GB')} district-seasons (${M.years[0]}–${M.years[1]}) from this platform's own satellite record. It is retrained every week. Scores are honest out-of-sample results: each year was predicted by a model trained on the other years only. It predicts greenness, not yield, and does not yet use seasonal rainfall forecasts.</p></div></div>`);
};

/* ---------------- "Ask AgroIntel" assistant ----------------
   Two engines. Built-in: answers in English from this site's data and the forecast, no server needed.
   AI mode: when config.js sets assistantUrl, the same grounded context goes to a small proxy that asks a
   large language model to answer in plain language, in the farmer's own language. */
const AI_CFG = (window.AGROINTEL_CONFIG || {});
const LANGS = [['en', 'English'], ['tw', 'Twi'], ['dag', 'Dagbani'], ['ha', 'Hausa'], ['ee', 'Ewe'], ['fr', 'French']];
let CHAT = { open: false, lang: 'en', msgs: [], ctx: null };
const normName = n => n.toLowerCase().replace(/\s+(municipal|metropolitan|district|municipality)\b.*$/, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
function findPlace(q) {
  const t = ' ' + q.toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ') + ' ';
  let best = null;
  const test = (alias, hit) => { if (alias.length >= 3 && t.includes(' ' + alias + ' ') && (!best || alias.length > best.len)) best = { ...hit, len: alias.length }; };
  (D.sum.district ? D.sum.district.units : []).forEach(u => { test(normName(u.name), { level: 'district', key: u.key }); test(u.name.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' '), { level: 'district', key: u.key }); });
  D.meta.regions.forEach(r => { test(r.name.toLowerCase().replace(/-/g, ' '), { level: 'region', key: r.key }); test(r.name.toLowerCase().replace(/-/g, ' ') + ' region', { level: 'region', key: r.key }); });
  if (D.res) D.res.items.forEach(i => test(i.name.toLowerCase().split(' ')[0], { reservoir: i.key, level: 'region', key: i.region || state.region }));
  return best;
}
const INTENTS = [
  ['predict', /\b(predict\w*|chance|likely|outlook|early warning|will .*season|poor season)\b/],
  ['plant', /\b(plant|planting|sow|sowing|when.*(start|begin)|seed)\b/],
  ['heat', /\b(heat|hot|temperature|warm)\b/],
  ['rain', /\b(rain|rains|rainfall|wet|forecast|weather|storm)\b/],
  ['drought', /\b(drought|dry|spi)\b/],
  ['crop', /\b(crop|crops|grow|suitable|which|cocoa|maize|rice|yam|cassava|sorghum|millet|groundnut|soy)\b/],
  ['soil', /\b(soil|fertili[sz]er|lime|nitrogen|ph|compost|manure)\b/],
  ['water', /\b(water|irrigat\w*|dam|reservoir|tono|vea|bontanga|weija|bui|volta|golinga|kpong)\b/],
  ['fire', /\b(fire|fires|burn|burning|forest|trees|deforest\w*|mining|galamsey)\b/],
  ['risk', /\b(risk|danger|safe|flood|floods|insurance)\b/],
  ['season', /\b(season|harvest|yield|crops? doing|how is|status|condition|health|green)\b/],
];
async function aiContext(place) {
  const lv = place ? place.level : curLevel(), key = place ? place.key : curKey();
  const U = await unitData(lv, key), V = asView(U, U.current_year);
  let F = null; const c = unitCentre(V);
  if (c) { try { F = await getForecast(c[0], c[1]); } catch (e) { F = null; } }
  return { V, F, S: F ? fcSummary(F) : null, place };
}
function builtInAnswer(q, C) {
  const { V, F, S } = C, nm = V.level === 'district' ? V.name : V.name + ' Region', out = [];
  let intents = INTENTS.filter(([, re]) => re.test(q.toLowerCase())).map(([k]) => k);
  if (/\b(hi|hello|help|what can you)\b/i.test(q) && !intents.length) return { html: `<p>I can tell you about rain, heat, planting time, drought, crops, soil, reservoirs, fires and risk for any district in Ghana. Name a place, for example <i>“When should I plant in Tolon?”</i></p>`, intents: [] };
  if (!intents.length) intents = ['season', 'rain'];
  const s = V.season || {}, rn = V.rain, add = (h) => out.push(h);
  for (const it of intents.slice(0, 3)) {
    if (it === 'plant' && S) { const a = fcAdvice(V, S).find(x => ['Hold off planting', 'Planting window', 'Wait for steadier rain', 'Dry spell ahead', 'Rain looks adequate', 'Dry season'].includes(x[1]));
      add(`<p><b>${esc(a ? a[1] : 'Planting')}.</b> ${esc(a ? a[2] : '')}${s.onset ? ` This year the rains became established on ${fmtDate(s.onset)}${isNum(s.onset_normal_doy) ? ` (usual: ${doyStr(s.onset_normal_doy)})` : ''}.` : ''}</p>`); }
    if (it === 'predict') { const E = ewFor(V); add(E && isNum(E.now) ? `<p><b>Early warning.</b> The AI model gives ${nm} a ${Math.round(E.now * 100)}% chance of a poor ${E.M.current_year} season (crop greenness in ${MONTH[E.M.target_months[0] - 1]}–${MONTH[E.M.target_months[1] - 1]} among the worst fifth of years), based on the season up to ${MONTH[E.M.cut_month - 1]}. Tested on past years, it was right ${Math.round(E.M.cv_accuracy * 100)}% of the time.</p>` : '<p>The early-warning model has no prediction for this place yet.</p>'); }
    if (it === 'rain') { add(`<p><b>Rain.</b> So far this year ${nm} has had ${fx(rn.total)} mm, ${pctTxt(rn.anomaly_pct)} for January–${MONTH[rn.last_month - 1]}.${S ? ` The next 7 days: about ${fx(S.rain7)} mm on ${S.rainDays7} day${S.rainDays7 === 1 ? '' : 's'}${S.dry.len >= 7 ? `, then about ${S.dry.len} dry days from ${dayName(S.dry.start)}` : ''}.` : ''}</p>`); }
    if (it === 'heat' && S) add(`<p><b>Heat.</b> ${S.severe.length ? `${S.severe.length} day${S.severe.length > 1 ? 's' : ''} at 38 °C or more are forecast, peaking at ${fx(S.peak.tmax)} °C on ${dayName(S.peak.date)}. Water crops early morning or evening, shade and water livestock, and avoid hard work at midday.` : S.hot.length ? `${S.hot.length} hot day${S.hot.length > 1 ? 's' : ''} (35 °C or more), peak ${fx(S.peak.tmax)} °C on ${dayName(S.peak.date)}.` : `No days above 35 °C in the next two weeks (peak ${fx(S.peak.tmax)} °C).`}</p>`);
    if (it === 'drought') add(`<p><b>Drought.</b> The 3-month drought index is ${sgn(rn.spi3_latest, 1)} (${esc((rn.spi_class || '').toLowerCase())}) at the end of ${MONTH[rn.spi_ref_month - 1]}. Drought risk is ${fx(V.risk.drought)}/100.</p>`);
    if (it === 'crop' && V.suitability) { const best = V.suitability.filter(c => c.class === 'S1').slice(0, 4), lim = V.suitability.filter(c => c.limits && c.limits.length).slice(0, 2);
      add(`<p><b>Crops.</b> Best suited to ${nm}'s climate and soil: ${esc(andJoin((best.length ? best : V.suitability.slice(0, 3)).map(c => c.name)))}.${lim.length ? ` Watch out: ${esc(lim.map(c => `${c.name} (${c.limits.join(', ')})`).join('; '))}.` : ''}</p>`); }
    if (it === 'soil' && V.soil) { const so = V.soil; add(`<p><b>Soil.</b> Typical topsoil here is ${esc((so.texture.name || '').toLowerCase())} with pH ${fx(so.ph.value, 1)} (${esc(so.ph.rating.toLowerCase())}), ${esc(so.oc.rating.toLowerCase())} organic carbon and ${esc(so.n.rating.toLowerCase())} nitrogen.${['Extremely acid', 'Strongly acid'].includes(so.ph.rating) ? ' Liming or wood ash helps on acidic soil.' : ''}${['Very low', 'Low'].includes(so.n.rating) ? ' Manure, compost or legumes in rotation add nitrogen.' : ''} These are satellite-model estimates: a soil test is best before buying fertiliser.</p>`); }
    if (it === 'water' && D.res) { const rk = V.level === 'district' ? V.region : V.key, rs = D.res.items.filter(i => i.region === rk || (C.place && C.place.reservoir === i.key));
      add(rs.length ? `<p><b>Reservoirs.</b> ${rs.map(i => { const t = i.stats || {}; return `${esc(i.name)}: ${fx(t.area_km2, 1)} km² of water in ${ymTxt(t.latest_month)}, ${isNum(t.pct_normal) ? t.pct_normal + '% of usual' : 'no usual figure yet'}`; }).join('; ')}. Use the irrigation planner to see how many hectares that water can support.</p>` : `<p><b>Water.</b> No monitored reservoir in this region. ${S && S.et07 > S.rain7 ? `This week crops will use about ${fx(S.et07 - S.rain7)} mm more water than the rain gives (${fx((S.et07 - S.rain7) * 10)} m³ per hectare).` : ''}</p>`); }
    if (it === 'fire' && V.change) { const F2 = changeFacts(V); add(`<p><b>Land change.</b> ${fx(F2.lossTot, 1)} km² of tree cover has been lost here since 2001${isNum(F2.lossPct) ? ` (${fx(F2.lossPct, 1)}% of the 2000 forest)` : ''}. In a typical year about ${fx(F2.bAvg)} km² burns, mostly in the dry season.</p>`); }
    if (it === 'risk') add(`<p><b>Risk.</b> Composite agricultural risk is ${fx(V.risk.composite)}/100 (${level(V.risk.composite)[0].toLowerCase()}): drought ${fx(V.risk.drought)}, flood ${fx(V.risk.flood)}, degradation ${fx(V.risk.degradation)}.</p>`);
    if (it === 'season') add(`<p><b>This season.</b> ${nm} is rated <b>${esc((V.status || 'unknown').toLowerCase())}</b>. Vegetation condition is ${fx(V.ndvi.vci)} out of 100 (${vciClass(V.ndvi.vci)[0].toLowerCase()}; 50 is typical). I can't predict yields, but this is how the crops look from space.</p>`);
  }
  return { html: out.join('') || '<p>I could not find data for that yet.</p>', intents };
}
function aiPayload(q, C) {
  const { V, S, F } = C, s = V.season || {}, rk = V.level === 'district' ? V.region : V.key;
  return { question: q.slice(0, 500), language: (LANGS.find(l => l[0] === CHAT.lang) || LANGS[0])[1], context: {
    place: V.level === 'district' ? `${V.name} district, ${(summary(V.region) || {}).name} Region, Ghana` : `${V.name} Region, Ghana`, today: new Date().toISOString().slice(0, 10),
    season: { status: V.status, rain_mm_to_date: Math.round(V.rain.total), rain_vs_normal_pct: V.rain.anomaly_pct && Math.round(V.rain.anomaly_pct), data_to_month: MONTH[V.rain.last_month - 1],
      spi3: V.rain.spi3_latest, onset: s.onset, usual_onset: doyStr(s.onset_normal_doy), cessation: s.cessation, usual_cessation: doyStr(s.cessation_normal_doy), dry_spells: s.dry_spells, vci: V.ndvi.vci },
    risk: V.risk, best_crops: (V.suitability || []).slice(0, 5).map(c => ({ crop: c.name, class: c.class, limits: c.limits })),
    soil: V.soil && { texture: V.soil.texture.name, ph: V.soil.ph, organic_carbon: V.soil.oc, nitrogen: V.soil.n, phosphorus: V.soil.p },
    reservoirs: D.res ? D.res.items.filter(i => i.region === rk).map(i => ({ name: i.name, area_km2: i.stats && i.stats.area_km2, pct_of_usual: i.stats && i.stats.pct_normal, month: i.stats && i.stats.latest_month })) : [],
    forecast_16_days: F ? F.map(d => ({ date: d.date, rain_mm: d.rain, rain_chance: d.prob, tmax: d.tmax, tmin: d.tmin, et0_mm: d.et0 })) : null,
    forecast_advice: S ? fcAdvice(V, S).map(a => a[1] + ': ' + a[2]) : null,
    early_warning: (() => { const E = ewFor(V); return E && isNum(E.now) ? { chance_of_poor_season_pct: Math.round(E.now * 100), predicted_from_data_to: MONTH[E.M.cut_month - 1], tested_accuracy_pct: Math.round(E.M.cv_accuracy * 100) } : null; })() } };
}
function chatHTML() {
  return `<div class="chat-head"><div><b>Ask AgroIntel</b><small id="chatCtx"></small></div>
      <div class="chat-tools">${AI_CFG.assistantUrl ? `<select id="chatLang" aria-label="Answer language">${LANGS.map(([k, l]) => `<option value="${k}"${k === CHAT.lang ? ' selected' : ''}>${l}</option>`).join('')}</select>` : ''}<button type="button" class="chat-x" id="chatX" aria-label="Close">×</button></div></div>
    <div class="chat-log" id="chatLog" aria-live="polite"></div>
    <div class="chat-sug" id="chatSug"></div>
    <form class="chat-in" id="chatForm"><button type="button" class="chat-mic" id="chatMic" aria-label="Speak your question" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3"/></svg></button>
      <input id="chatQ" autocomplete="off" placeholder="e.g. When should I plant in Tolon?" aria-label="Your question" maxlength="400"><button class="btn primary" type="submit">Ask</button></form>
    <p class="chat-foot">${AI_CFG.assistantUrl ? 'Answers by an AI model, using only this site\'s data and the forecast. Check important decisions with your extension officer.' : 'Answers come straight from this site\'s satellite data and the Open-Meteo forecast. Check important decisions with your extension officer.'}</p>`;
}
function chatPush(who, html) { CHAT.msgs.push([who, html]); const log = $('#chatLog'); if (!log) return;
  const d = document.createElement('div'); d.className = 'msg ' + who; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight;
  if (who === 'bot' && 'speechSynthesis' in window) { const b = document.createElement('button'); b.type = 'button'; b.className = 'speak'; b.textContent = '🔊 Read aloud';
    b.onclick = () => { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(d.innerText.replace('🔊 Read aloud', '')); u.lang = 'en-GB'; u.rate = .95; speechSynthesis.speak(u); }; d.appendChild(b); } }
const SUGS = ['When should I plant?', 'Is heat coming this week?', 'Which crops suit this area?', 'How full is the dam?', 'Is drought building?', 'What is my soil like?'];
async function ask(q) {
  q = q.trim(); if (!q) return;
  chatPush('me', esc(q)); $('#chatQ').value = '';
  const wait = document.createElement('div'); wait.className = 'msg bot typing'; wait.textContent = 'Checking the data…'; $('#chatLog').appendChild(wait);
  try {
    const place = findPlace(q), C = await aiContext(place);
    $('#chatCtx').textContent = C.V.level === 'district' ? `${C.V.name} · ${(summary(C.V.region) || {}).name} Region` : `${C.V.name} Region`;
    let html;
    if (AI_CFG.assistantUrl) {
      try { const r = await fetch(AI_CFG.assistantUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(aiPayload(q, C)) });
        if (!r.ok) throw new Error('AI service ' + r.status); const j = await r.json();
        html = esc(j.answer || '').split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>`).join('');
      } catch (e) { html = builtInAnswer(q, C).html + `<p class="note">(The AI service was unavailable, so this answer comes from the built-in assistant.)</p>`; }
    } else html = builtInAnswer(q, C).html;
    wait.remove(); chatPush('bot', html + `<p class="src">${esc(C.V.level === 'district' ? C.V.name : C.V.name + ' Region')} · satellite data to ${fmtDate(D.meta.rain_latest)}${C.F ? ' · forecast: Open-Meteo' : ''}</p>`);
  } catch (e) { wait.remove(); chatPush('bot', `<p>Sorry, I could not load the data (${esc(e.message)}).</p>`); }
}
function buildChat() {
  if ($('#chatFab')) return;
  const fab = document.createElement('button'); fab.id = 'chatFab'; fab.type = 'button'; fab.className = 'chat-fab'; fab.setAttribute('aria-label', 'Ask AgroIntel');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z M8 10h8 M8 13h5"/></svg><span>Ask AgroIntel</span>';
  const panel = document.createElement('section'); panel.id = 'chatPanel'; panel.className = 'chat'; panel.hidden = true; panel.setAttribute('aria-label', 'Ask AgroIntel'); panel.innerHTML = chatHTML();
  document.body.append(fab, panel);
  const open = v => { CHAT.open = v; panel.hidden = !v; fab.hidden = v; if (v) { $('#chatQ').focus(); if (!CHAT.msgs.length) chatPush('bot', `<p>Hello! Ask me about rain, heat, planting, crops, soil, dams or risk for any district in Ghana. I'll answer from satellite data and the latest forecast.</p>`); } };
  fab.onclick = () => open(true); $('#chatX').onclick = () => open(false);
  $('#chatSug').innerHTML = SUGS.map(s => `<button type="button" class="chip-b">${s}</button>`).join('');
  $$('#chatSug .chip-b').forEach(b => b.onclick = () => ask(b.textContent));
  $('#chatForm').onsubmit = e => { e.preventDefault(); ask($('#chatQ').value); };
  const ls = $('#chatLang'); if (ls) ls.onchange = e => { CHAT.lang = e.target.value; };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) { const mic = $('#chatMic'); mic.hidden = false; mic.onclick = () => { const r = new SR(); r.lang = 'en-GB'; r.interimResults = false; mic.classList.add('on');
    r.onresult = e => { const t = e.results[0][0].transcript; $('#chatQ').value = t; ask(t); }; r.onend = () => mic.classList.remove('on'); r.onerror = () => mic.classList.remove('on'); r.start(); }; }
}

function syncPickers() {
  $('#region').value = state.region;
  const ds = D.sum.district ? D.sum.district.units.filter(u => u.region === state.region).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const dsel = $('#district'); dsel.hidden = !ds.length;
  dsel.innerHTML = `<option value="">All districts</option>` + ds.map(u => `<option value="${u.key}">${esc(u.name)}</option>`).join('');
  dsel.value = state.district || '';
  $('#year').value = String(state.year);
}
async function boot() {
  try {
    [D.meta, D.geo] = await Promise.all([getJSON('data/meta.json'), getJSON('data/regions.geojson')]);
    if (D.meta.farms) D.farms = await getJSON('data/farms.json').catch(() => null);
    if (D.meta.model) D.model = await getJSON('data/model.json').catch(() => null);
    if (D.meta.reservoirs) [D.res, D.resGeo] = await Promise.all([getJSON('data/reservoirs.json').catch(() => null), getJSON('data/reservoirs.geojson').catch(() => null)]);
  } catch (e) {
    document.body.innerHTML = `<p class="loading">Could not load data (${esc(e.message)}). Run the pipeline or <code>python pipelines/make_sample_data.py</code> first.</p>`; return;
  }
  if (D.meta.sample) { const b = $('#banner'); b.hidden = false; b.textContent = 'Sample data: the Earth Engine pipeline has not run yet, so figures are simulated.'; }
  if (D.meta.districts) {
    [D.dgeo, D.sum.district] = await Promise.all([getJSON('data/districts.geojson').catch(() => null), getJSON('data/summary_district.json').catch(() => null)]);
  }
  D.sum.region = await getJSON('data/summary_region.json').catch(() => ({ units: D.meta.regions.map(r => ({ key: r.key, name: r.name, region: r.key, years: { [D.meta.year]: r } })) }));
  if (!summary(state.region)) state.region = 'northern';
  if (state.district && !(D.sum.district && sumUnit('district', state.district))) state.district = null;
  const first = D.meta.first_year || D.meta.year;
  if (!state.year || state.year > D.meta.year || state.year < first) state.year = D.meta.year;
  $('#region').innerHTML = D.meta.regions.map(r => `<option value="${r.key}">${esc(r.name)}</option>`).join('');
  $('#year').innerHTML = Array.from({ length: D.meta.year - first + 1 }, (_, i) => D.meta.year - i).map(y => `<option value="${y}">${y}</option>`).join('');
  $('#region').onchange = e => { state.region = e.target.value; state.district = null; save(); syncPickers(); route(); };
  $('#district').onchange = e => { state.district = e.target.value || null; save(); route(); };
  $('#year').onchange = e => { state.year = Number(e.target.value); save(); route(); };
  syncPickers();
  $('#asof').textContent = `Rain to ${fmtDay(D.meta.rain_latest)} ${D.meta.rain_latest.slice(0, 4)}`;
  buildLanding();
    buildChat();
  window.addEventListener('hashchange', route);
  route();
}
boot();
})();
