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
    water: U.water, balance: b.balance, suitability: U.suitability, soil: U.soil, land: U.land, ndviBasis: U.ndvi_basis, risk: b.risk, status: b.status };
}

/* ---------------- state ---------------- */
let state = Object.assign({ region: 'northern', district: null, year: null, level: 'region', ind: 'risk', sub: { crop: 'health', climate: 'rain', water: 'surface', risk: 'summary', farms: 'trace' }, farm: null },
  store.get('agrointel.state', {}));
const save = () => store.set('agrointel.state', { region: state.region, district: state.district, year: state.year, level: state.level, ind: state.ind, sub: state.sub, farm: state.farm });

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
  const W = 360, H = o.h || 200, L = 40, R = 12, T = 12, B = 22, iw = W - L - R, ih = H - T - B;
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
  farms: '<path d="M4 8l7-4 9 5-2 11-12-2z"/>'
};
const MODS = {
  overview: { n: 'Overview' },
  crop: { n: 'Crop', full: 'Crop intelligence', col: 'green', ltr: 'A', subs: [['health', 'Vegetation health'], ['growth', 'Crop growth'], ['suit', 'Crop suitability'], ['soil', 'Soil and land'], ['season', 'Season assessment']],
    items: ['Vegetation health on farmland', 'Crop growth through the season', 'Crop suitability: climate and soil', 'Soil profile (iSDAsoil)', 'Seasonal assessment'] },
  climate: { n: 'Climate', full: 'Climate intelligence', col: 'gold', ltr: 'B', subs: [['rain', 'Rainfall'], ['anom', 'Anomalies'], ['temp', 'Temperature'], ['drought', 'Drought'], ['ind', 'Season indicators']],
    items: ['Rainfall vs 1991–2020 normal', 'Monthly anomalies', 'Temperature trend since 1996', 'Drought (SPI-3)', 'Onset, cessation, dry spells'] },
  water: { n: 'Water', full: 'Water intelligence', col: 'water', ltr: 'C', subs: [['surface', 'Surface water'], ['stress', 'Water stress']],
    items: ['Surface water from radar', 'Extent vs 2017–2021 baseline', 'Water balance (rain − PET)', 'Aridity index'] },
  risk: { n: 'Risk', full: 'Agricultural risk', col: 'red', ltr: 'D', subs: [['summary', 'Risk summary'], ['map', 'Vegetation anomaly map']],
    items: ['Drought exposure', 'Flood exposure', 'Land degradation trend', 'Production risk'] },
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
  $('#heroFresh').textContent = `Rainfall data to ${fmtDate(D.meta.rain_latest)} · updated every Monday`;
  buildSlides();
  const picks = ['northern', 'upper-east', 'ashanti', 'volta', 'greater-accra'].filter(k => summary(k));
  $('#demoChips').innerHTML = picks.map(k => `<button type="button" class="chip-b" data-k="${k}" aria-pressed="false">${esc(summary(k).name)}</button>`).join('');
  $$('#demoChips .chip-b').forEach(b => b.onclick = () => buildDemo(b.dataset.k));
  buildDemo(picks[0] || D.meta.regions[0].key);
  $('#modTiles').innerHTML = Object.entries(MODS).filter(([k]) => k !== 'overview').map(([k, m]) => `<a class="modc" href="#${k}"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg></span><h3>${m.full}</h3><ul>${m.items.map(i => `<li>${i}</li>`).join('')}</ul><span class="go">Open ${m.n.toLowerCase()} →</span></a>`).join('');
  const hasTamale = D.sum.district && sumUnit('district', 'd-tamale-metropolitan');
  $('#trio').innerHTML = `<a class="card dark" href="#climate" id="replay"><span class="tag">SEASON REPLAY</span><h3>Go back to any season since ${D.meta.first_year || 2001}</h3>
      <div class="years" aria-hidden="true"><span>2011</span><span>2013</span><span class="sel">2015</span><span>2019</span><span>2024</span><span>${D.meta.year}</span></div>
      <p>Tamale, 2015: the rains came about six weeks late and the season ended 22% drier than normal.</p></a>
    <a class="card" href="#farms"><span class="tag">FARM TRACER</span><h3>Map a field in a minute</h3><div class="field" aria-hidden="true"></div><p>Draw a boundary on satellite imagery to get its area, greenness through the year, and a tree-loss check since 2021.</p></a>
    <a class="card" href="${REPO}" target="_blank" rel="noopener"><span class="tag">OPEN SOURCE</span><h3>Runs in the open, every week</h3><div class="gh" aria-hidden="true"><b>✓</b> rainfall to ${esc(fmtDay(D.meta.rain_latest))}<br><b>✓</b> vegetation, water, risk<br><b>✓</b> ${D.meta.regions.length} regions${nd ? ` · ${nd} districts` : ''}<br><b>✓</b> published ${esc((D.meta.generated || '').slice(0, 10))}</div><p>The Earth Engine pipeline and this site are on GitHub under the MIT licence.</p></a>`;
  $('#replay').onclick = () => { state.region = 'northern'; state.district = hasTamale ? 'd-tamale-metropolitan' : null; state.year = 2015; state.sub.climate = 'ind'; save(); syncPickers(); };
}

function renderNav(mod) {
  $('#nav').innerHTML = Object.entries(MODS).map(([k, m]) => `<a class="nv" href="#${k}"${mod === k ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>${m.n}</a>`).join('');
}

async function route() {
  const h = location.hash.slice(1);
  const inApp = !!MODS[h] || h === 'methods';
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
      <p class="note">To monitor this farm with Sentinel-2, download its GeoJSON and add the feature to <a href="${REPO}/blob/main/data/farms.geojson" target="_blank" rel="noopener">data/farms.geojson</a>. The next weekly run analyses it.</p>
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
      <li><strong>Soil ratings</strong> use the iSDAsoil 0–20 cm means, back-transformed per pixel and averaged over land that is not built-up or water. Bands: pH below 4.5 extremely, 4.5–5.5 strongly, 5.5–6.5 moderately acid; organic carbon below 6, 12 and 20 g/kg very low, low, moderate; total nitrogen below 0.5, 1 and 2 g/kg; extractable phosphorus below 10 and 25 ppm; potassium below 60 and 150 ppm; bedrock shallower than 50 and 100 cm.</li>
      <li><strong>Past seasons</strong> (2001 onward) use full-year rainfall, SPI-3 at the end of the main season, and vegetation condition averaged over the growing season. Surface water and map images cover the latest month only.</li>
      <li><strong>Risk indices</strong> are transparent heuristics (0–100) combining SPI, rainfall anomaly, dry spells, surface water, NDVI trend and VCI. They are indicators for discussion, not validated predictions.</li>
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
  window.addEventListener('hashchange', route);
  route();
}
boot();
})();
