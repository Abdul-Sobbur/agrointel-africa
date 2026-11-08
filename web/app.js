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
const D = { meta: null, geo: null, farms: null, regions: {} };
async function getJSON(p) { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); }
async function region(k) { if (!D.regions[k]) D.regions[k] = await getJSON(`data/regions/${k}.json`); return D.regions[k]; }
const summary = k => D.meta.regions.find(r => r.key === k);

/* ---------------- state ---------------- */
let state = Object.assign({ region: 'northern', ind: 'risk', sub: { crop: 'health', climate: 'rain', water: 'surface', risk: 'summary', farms: 'trace' }, farm: null },
  store.get('agrointel.state', {}));
const save = () => store.set('agrointel.state', { region: state.region, ind: state.ind, sub: state.sub, farm: state.farm });

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
function regionMap(id, layer) {
  const m = newMap(id); if (!m) return;
  const f = regionFeature(state.region);
  const outline = L.geoJSON(f, { style: { color: '#11142E', weight: 2, fill: false } }).addTo(m);
  m.fitBounds(outline.getBounds(), { padding: [12, 12] });
  const mm = D.meta.maps && D.meta.maps.regions && D.meta.maps.regions[state.region];
  if (mm && layer) L.imageOverlay(`data/maps/${state.region}_${layer}.png?v=${encodeURIComponent(D.meta.generated)}`, mm.bounds, { opacity: .9 }).addTo(m);
  return m;
}
const mapMissing = () => D.meta.maps ? '' : '<p class="note">Map images appear after the first Earth Engine pipeline run.</p>';

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
  crop: { n: 'Crop', full: 'Crop intelligence', col: 'green', ltr: 'A', subs: [['health', 'Vegetation health'], ['growth', 'Crop growth'], ['suit', 'Crop suitability'], ['season', 'Season assessment']],
    items: ['Vegetation health (NDVI, VCI)', 'Crop growth through the season', 'Crop suitability (FAO classes)', 'Seasonal assessment'] },
  climate: { n: 'Climate', full: 'Climate intelligence', col: 'gold', ltr: 'B', subs: [['rain', 'Rainfall'], ['anom', 'Anomalies'], ['temp', 'Temperature'], ['drought', 'Drought'], ['ind', 'Season indicators']],
    items: ['Rainfall vs 1991–2020 normal', 'Monthly anomalies', 'Temperature trend since 1996', 'Drought (SPI-3)', 'Onset, cessation, dry spells'] },
  water: { n: 'Water', full: 'Water intelligence', col: 'water', ltr: 'C', subs: [['surface', 'Surface water'], ['stress', 'Water stress']],
    items: ['Surface water from radar', 'Extent vs 2017–2021 baseline', 'Water balance (rain − PET)', 'Aridity index'] },
  risk: { n: 'Risk', full: 'Agricultural risk', col: 'red', ltr: 'D', subs: [['summary', 'Risk summary'], ['map', 'Vegetation anomaly map']],
    items: ['Drought exposure', 'Flood exposure', 'Land degradation trend', 'Production risk'] },
  farms: { n: 'Farms', full: 'Farm management', col: 'kblack', ltr: 'E', subs: [['trace', 'Map a farm'], ['list', 'Monitored farms']],
    items: ['Trace boundaries on imagery', 'Area and perimeter', 'Sentinel-2 field monitoring', 'Forest-loss check since 2021'] }
};
const LOGO = '<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><rect width="30" height="30" rx="7" fill="#161616"/><rect x="5" y="5" width="20" height="5" fill="#E3A015"/><rect x="5" y="12.5" width="20" height="5" fill="#0E7A44"/><rect x="5" y="20" width="20" height="5" fill="#C2302A"/><rect x="9" y="3" width="4" height="24" fill="#E3A015" opacity=".9"/><rect x="17" y="3" width="4" height="24" fill="#F3F2FB" opacity=".85"/></svg>';

function buildLanding() {
  $$('.lm').forEach(e => e.outerHTML = LOGO);
  $('#repoLink').href = REPO;
  // hero map from the real region boundaries
  const proj = ([lon, lat]) => [(lon + 3.45) * 60, (11.25 - lat) * 60];
  const path = g => g.coordinates.map(ring => 'M' + ring.map(p => proj(p).map(v => v.toFixed(1)).join(' ')).join('L') + 'Z').join('');
  const cols = ['var(--gold)', 'var(--green)', 'var(--red)'];
  let s = D.geo.features.map(f => `<path class="rg" d="${path(f.geometry)}"/>`).join('');
  D.geo.features.forEach((f, i) => { const ring = f.geometry.coordinates[0]; const lon = ring.reduce((a, p) => a + p[0], 0) / ring.length, lat = ring.reduce((a, p) => a + p[1], 0) / ring.length;
    const [x, y] = proj([lon, lat]), c = cols[i % 3]; s += `<circle class="pulse" cx="${x}" cy="${y}" r="5" fill="${c}" style="animation-delay:${(i % 8) / 4}s"/><circle cx="${x}" cy="${y}" r="3.5" fill="${c}"/>`; });
  const R = D.meta.regions, byRisk = [...R].sort((a, b) => b.risk.composite - a.risk.composite)[0], byVci = [...R].filter(r => isNum(r.vci)).sort((a, b) => b.vci - a.vci)[0], byRain = [...R].sort((a, b) => Math.abs(b.rain_anom) - Math.abs(a.rain_anom))[0];
  $('#heroVis').innerHTML = `<svg viewBox="-4 -4 300 410" role="img" aria-label="Ghana's 16 regions">${s}</svg>
    <div class="float f1"><span class="dot" style="background:var(--green)"></span>${esc(byVci.name)} · vegetation<b>VCI ${fx(byVci.vci)}</b></div>
    <div class="float f2"><span class="dot" style="background:var(--red)"></span>${esc(byRisk.name)} · risk<b>${byRisk.risk.composite}/100</b></div>
    <div class="float f3"><span class="dot" style="background:var(--gold)"></span>${esc(byRain.name)} · rainfall<b>${sgn(byRain.rain_anom)}% vs normal</b></div>`;
  $('#stats').innerHTML = `<div><b>16</b><span>regions monitored</span></div><div><b>${fmtDay(D.meta.rain_latest)}</b><span>latest rainfall data</span></div><div><b>1991–2020</b><span>climate baseline</span></div><div><b>10 m</b><span>farm-level imagery</span></div>`;
  $('#modTiles').innerHTML = Object.entries(MODS).filter(([k]) => k !== 'overview').map(([k, m]) => `<div class="mod"><div class="ltr" style="background:var(--${m.col})">${m.ltr}</div><h3>${m.full}</h3><ul>${m.items.map(i => `<li>${i}</li>`).join('')}</ul></div>`).join('');
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
  $('#region').value = state.region;
  window.scrollTo(0, 0);
  await renderView(h);
}

async function renderView(mod) {
  clearMaps();
  const view = $('#view');
  if (mod === 'methods') { view.innerHTML = methodsView(); return; }
  if (mod === 'overview') { view.innerHTML = overview(); afterOverview(); return; }
  view.innerHTML = '<p class="loading">Loading…</p>';
  const R = await region(state.region);
  const m = MODS[mod], sub = state.sub[mod];
  view.innerHTML = `<div class="mhead"><span class="crumb">${esc(R.name)} Region · ${R.year} season to ${MONTH[R.rain.last_month - 1]}</span><h1>${m.full}</h1><div class="kente thin"></div></div>
    <div class="subs" role="tablist">${m.subs.map(([k, l]) => `<button class="sub" role="tab" type="button" data-sub="${k}" aria-selected="${k === sub}">${l}</button>`).join('')}</div>
    ${VIEWS[mod][sub](R)}
    <p class="disclaimer">${D.meta.sample ? 'Sample data generated offline. ' : ''}Indicators are computed automatically from open satellite and climate data and have not been validated in the field. See <a href="#methods">data and methods</a>.</p>`;
  $$('[data-sub]').forEach(b => b.onclick = () => { state.sub[mod] = b.dataset.sub; save(); renderView(mod); });
  AFTER[mod] && AFTER[mod][sub] && AFTER[mod][sub](R);
}

/* ---------------- overview ---------------- */
function indValue(r, ind) {
  if (ind === 'rain') { const a = r.rain_anom; return [a < -20 ? 'bad' : a < -10 ? 'warn' : a > 25 ? 'neu' : 'good', sgn(a) + '%']; }
  if (ind === 'veg') return [vciClass(r.vci)[1], fx(r.vci)];
  return [level(r.risk.composite)[1], String(r.risk.composite)];
}
function alerts() {
  const out = [];
  D.meta.regions.forEach(r => {
    if (r.risk.drought >= 60) out.push({ k: r.key, mod: 'risk', sev: r.risk.drought, c: level(r.risk.drought)[1], t: `Drought risk ${level(r.risk.drought)[0].toLowerCase()} in ${r.name}`, d: `SPI-3 ${sgn(r.spi3, 1)}, rainfall ${sgn(r.rain_anom)}% vs normal` });
    if (r.risk.flood >= 55) out.push({ k: r.key, mod: 'water', sev: r.risk.flood, c: level(r.risk.flood)[1], t: `Flood exposure ${level(r.risk.flood)[0].toLowerCase()} in ${r.name}`, d: `Rainfall ${sgn(r.rain_anom)}% vs normal` });
    if (isNum(r.vci) && r.vci < 30) out.push({ k: r.key, mod: 'crop', sev: 80 - r.vci, c: 'warn', t: `Vegetation stress in ${r.name}`, d: `VCI ${fx(r.vci)}, below normal greenness` });
    if (r.rain_anom < -18) out.push({ k: r.key, mod: 'climate', sev: -r.rain_anom + 30, c: 'warn', t: `Rainfall deficit in ${r.name}`, d: `${sgn(r.rain_anom)}% vs the 1991–2020 normal` });
  });
  return out.sort((a, b) => b.sev - a.sev).slice(0, 6);
}
function overview() {
  const r = summary(state.region), al = alerts(), [cl, cc] = level(r.risk.composite);
  const legend = state.ind === 'rain' ? [['good', 'Normal'], ['warn', 'Dry'], ['bad', 'Very dry'], ['neu', 'Very wet']] : state.ind === 'veg' ? [['good', 'Above normal'], ['mod', 'Near normal'], ['warn', 'Below'], ['bad', 'Poor']] : [['good', 'Low'], ['mod', 'Moderate'], ['warn', 'High'], ['bad', 'Very high']];
  return `<div class="hello"><span class="lbl">${D.meta.year} season · rainfall to ${fmtDate(D.meta.rain_latest)}</span><h1><em>Akwaaba.</em> Here is Ghana at a glance.</h1><p>Tap a region on the map to see how its season is going.</p></div>
  <div class="ovgrid">
    <section class="panel">
      <div class="seg" role="group" aria-label="Map indicator">${[['risk', 'Risk'], ['rain', 'Rainfall'], ['veg', 'Vegetation']].map(([k, l]) => `<button type="button" data-ind="${k}" aria-pressed="${state.ind === k}">${l}</button>`).join('')}</div>
      <div id="ovmap" class="lmap tall"></div>
      <div class="sw">${legend.map(([c, l]) => `<span><i style="background:${COLOR[c]}"></i>${l}</span>`).join('')}</div>
    </section>
    <div class="stack-v">
      <section class="panel">
        ${verdict(chip(r.status + ' season', statusCls(r.status)), esc(r.name) + ' Region', `${esc(r.zone)}, around ${esc(r.capital)}. ${r.regime === 'uni' ? 'One rainy season, May to October.' : 'Two rainy seasons, roughly April to July and September to November.'}`)}
        <div class="facts">${fact('Rainfall', sgn(r.rain_anom) + '%', 'vs normal')}${fact('Vegetation', 'VCI ' + fx(r.vci), vciClass(r.vci)[0])}${fact('Risk', r.risk.composite, cl)}</div>
        <div class="quick"><a class="btn primary" href="#climate">Rainfall detail</a><a class="btn" href="#crop">Crop health</a><a class="btn" href="#risk">Risk</a></div>
      </section>
      <section class="panel">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><h3 style="font-size:18px">Alerts</h3><span class="lbl">${al.length} active</span></div>
        ${al.length ? `<div class="alerts">${al.map(a => `<button class="alert" type="button" data-alert="${a.k}" data-mod="${a.mod}"><span class="bar" style="background:var(--${a.c === 'neu' ? 'water' : a.c})"></span><div><b>${esc(a.t)}</b><span>${esc(a.d)}</span></div><span class="go">View →</span></button>`).join('')}</div>` : `<div class="empty">No active alerts.</div>`}
      </section>
    </div>
  </div>
  <p class="disclaimer">${D.meta.sample ? 'Sample data generated offline. ' : `Updated ${esc(D.meta.generated.slice(0, 10))}. `}<a href="#methods">How these numbers are made</a>.</p>`;
}
function afterOverview() {
  $$('[data-ind]').forEach(b => b.onclick = () => { state.ind = b.dataset.ind; save(); renderView('overview'); });
  $$('[data-alert]').forEach(b => b.onclick = () => { state.region = b.dataset.alert; save(); location.hash = b.dataset.mod; });
  const m = newMap('ovmap'); if (!m) return;
  const layer = L.geoJSON(D.geo, {
    style: f => { const r = summary(f.properties.key), [c] = indValue(r, state.ind), sel = f.properties.key === state.region;
      return { color: sel ? '#11142E' : '#ffffff', weight: sel ? 3 : 1, fillColor: COLOR[c], fillOpacity: .62 }; },
    onEachFeature: (f, l) => { const r = summary(f.properties.key), [, v] = indValue(r, state.ind);
      l.bindTooltip(v, { permanent: true, direction: 'center', className: 'val' });
      l.on('click', () => { state.region = f.properties.key; save(); $('#region').value = state.region; renderView('overview'); }); }
  }).addTo(m);
  m.fitBounds(layer.getBounds(), { padding: [6, 6] });
}

/* ---------------- module views ---------------- */
const VIEWS = { crop: {}, climate: {}, water: {}, risk: {}, farms: {} }, AFTER = { crop: {}, climate: {}, water: {}, risk: {}, farms: {} };

VIEWS.crop.health = R => { const n = R.ndvi, v = vciClass(n.vci), lm = n.latest_month, cur = lm ? n.monthly[lm - 1] : null, nor = lm ? n.normal[lm - 1] : null;
  const pct = isNum(cur) && isNum(nor) ? (cur / nor - 1) * 100 : null;
  return P(`<div class="split"><div class="stack-v"><div id="m1" class="lmap"></div>
    <div class="legend"><div class="bar" style="background:linear-gradient(90deg,#8c6842,#b8985f,#d6c470,#a0be58,#5c9c46,#267034,#124a28)"></div><div class="ends"><span>Bare soil</span><span>Sparse</span><span>Dense vegetation</span></div></div>${mapMissing()}
    <p class="note">MODIS NDVI, 250 m${D.meta.maps ? ', composite of ' + fmtDate(D.meta.maps.ndvi_date) : ''}.</p></div>
    <div class="stack-v">${verdict(chip(v[0], v[1]), `Vegetation is ${v[0].toLowerCase()}`, lm ? `Average greenness in ${esc(R.name)} for ${MONTH[lm - 1]} ${n.year} is ${fx(Math.abs(pct))}% ${pct >= 0 ? 'above' : 'below'} the 2001–2020 average for that month.` : 'No recent vegetation data.')}
    <div class="facts">${fact('NDVI', fx(cur, 2), 'normal ' + fx(nor, 2))}${fact('Condition (VCI)', fx(n.vci), '0 worst, 100 best')}</div>
    <p class="note">NDVI measures how green and leafy the land is. The condition score compares this month with the same month in every year since 2001: 50 is typical, above 50 greener than usual, below 50 browner.</p></div></div>`); };
AFTER.crop.health = () => regionMap('m1', 'ndvi');

VIEWS.crop.growth = R => { const n = R.ndvi, main = R.suitability.find(c => ['maize', 'sorghum', 'millet', 'rice', 'soy', 'gnut'].includes(c.key));
  const lm = n.latest_month, diff = lm ? (n.monthly[lm - 1] / n.normal[lm - 1] - 1) * 100 : null;
  return P(`${verdict(chip(diff == null ? 'No data' : diff >= -5 ? 'On track' : 'Behind', diff == null ? 'neu' : diff >= -5 ? 'good' : 'warn'), `Greenness in ${n.year} against the usual curve`, `The green line tracks average greenness month by month. Where it sits below the dashed line, vegetation is behind or stressed. `)}
    ${lineChart([{ vals: n.normal, cls: 'l-norm', dash: true }, { vals: n.monthly, cls: 'l-act', area: true, dot: true }], MON.map(m => m[0]), { fmt: v => fx(v, 2), min: 0, max: Math.max(.8, niceMax(Math.max(...n.normal.filter(isNum)))), title: 'Greenness through the season' })}
    <div class="key"><span><i class="line" style="background:var(--green)"></i>${n.year}</span><span><i class="line" style="background:var(--muted)"></i>2001–2020 average</span></div>`); };

VIEWS.crop.suit = R => { const s1 = R.suitability.filter(c => c.class === 'S1'), top = R.suitability[0];
  const head = s1.length > 1 ? `${s1.length} crops are highly suitable in ${esc(R.name)}` : s1.length === 1 ? `${esc(s1[0].name)} is the best fit for ${esc(R.name)}` : `No crop is highly suitable; ${esc(top.name.toLowerCase())} fits best`;
  return P(`${verdict(chip(s1.length ? s1.map(c => c.name).slice(0, 4).join(', ') + (s1.length > 4 ? '…' : '') : suitName(top.class), s1.length ? 'good' : suitCol(top.class)), head, `Scores compare each crop's needs with the 1991–2020 climate here: ${fx(R.rain.annual_normal)} mm of rain a year, ${fx(R.temp.normal, 1)} °C average temperature${isNum(R.season.los_normal) ? ` and a ${R.season.los_normal}-day rainy season` : ''}. Soil is not yet included, so several crops can tie; within a class, crops are ordered by how close the climate sits to their ideal.`)}
    <div class="rows">${R.suitability.map(c => `<div class="row"><span class="nm">${esc(c.name)}</span><span class="sc">${c.class} · ${c.score}</span>${meter(c.score, suitCol(c.class))}</div>`).join('')}</div>
    <p class="note">Classes follow FAO land evaluation: S1 highly, S2 moderately, S3 marginally suitable, N not suitable.</p>`); };

VIEWS.crop.season = R => { const s = R.season, od = s.onset && isNum(s.onset_normal_doy) ? doyOf(s.onset) - s.onset_normal_doy : null;
  const txt = `Rainfall is ${fx(Math.abs(R.rain.anomaly_pct))}% ${R.rain.anomaly_pct >= 0 ? 'above' : 'below'} normal from January to ${MONTH[R.rain.last_month - 1]}. ` +
    (s.onset ? `The rains started on ${fmtDay(s.onset)}${od != null ? `, ${Math.abs(od)} days ${od > 0 ? 'later' : 'earlier'} than the usual ${doyStr(s.onset_normal_doy)}` : ''}. ` : 'A clear start of the rains has not been detected yet. ') +
    (isNum(s.dry_spells) ? `${s.dry_spells} dry spell${s.dry_spells === 1 ? '' : 's'} of a week or more were recorded. ` : '') +
    `Vegetation condition is ${vciClass(R.ndvi.vci)[0].toLowerCase()}.`;
  return P(`${verdict(chip(R.status, statusCls(R.status)), `A ${R.status.toLowerCase()} season in ${esc(R.name)}`, esc(txt))}
    <div class="facts">${fact('Rainfall', sgn(R.rain.anomaly_pct) + '%', fx(R.rain.total) + ' mm so far')}${fact('Drought index', sgn(R.rain.spi3_latest, 1), R.rain.spi_class)}${fact('Vegetation', 'VCI ' + fx(R.ndvi.vci), vciClass(R.ndvi.vci)[0])}</div>
    <p class="note">Yield forecasts need harvest records to train on, so they are not shown yet.</p>`); };

VIEWS.climate.rain = R => P(`${verdict(chip(fx(R.rain.total) + ' mm so far', 'neu'), `Rainfall is ${fx(Math.abs(R.rain.anomaly_pct))}% ${R.rain.anomaly_pct >= 0 ? 'above' : 'below'} normal`, `January to ${MONTH[R.rain.last_month - 1]} ${R.year}, against ${fx(R.rain.normal_to_date)} mm normally. ${R.regime === 'uni' ? 'One rainy season, typical of the north.' : 'Two rainy seasons, typical of the south.'}`)}
  <div class="split"><div>${barsCompare(R.rain.normal, R.rain.monthly)}</div>
  <div class="stack-v"><div class="key" style="display:grid;gap:8px"><span><i style="background:var(--sunk)"></i>1991–2020 normal</span><span><i style="background:var(--accent)"></i>Observed (CHIRPS v3)</span><span><i style="background:var(--warn)"></i>Under 75% of normal</span><span><i style="background:var(--water)"></i>Over 130% of normal</span></div>
  <div class="facts">${fact('Annual normal', fx(R.rain.annual_normal) + ' mm', '')}${fact('Data to', fmtDay(R.rain.latest_date), String(R.year))}</div></div></div>`);

VIEWS.climate.anom = R => { const a = R.rain.monthly_anom, nm = R.rain.normal;
  const dry = a.filter((v, i) => isNum(v) && v < -25 && nm[i] >= 40).length, wet = a.filter((v, i) => isNum(v) && v > 30 && nm[i] >= 40).length;
  const vals = MON.map((_, i) => a[i] ?? null);
  return P(`${verdict(chip(sgn(R.rain.anomaly_pct) + '% overall', R.rain.anomaly_pct < -20 ? 'bad' : R.rain.anomaly_pct < -10 ? 'warn' : 'good'), `${dry} dry month${dry === 1 ? '' : 's'}, ${wet} wet month${wet === 1 ? '' : 's'}`, 'Each bar shows how far a month departed from its 1991–2020 normal. Faded bars are dry-season months, where small totals swing the percentage.')}
    ${diverging(vals, { lim: 100, fmt: v => (v > 0 ? '+' : '') + v + '%', pos: 'b-wet', neg: 'b-dry', title: 'Monthly rainfall anomaly', faded: nm.map(n => n < 20) })}`); };

VIEWS.climate.temp = R => { const t = R.temp, last = t.annual.filter(isNum).slice(-1)[0];
  return P(`${verdict(chip(sgn(t.trend_decade, 2) + ' °C per decade', t.trend_decade > 0 ? 'warn' : 'good'), `${esc(R.name)} is ${t.trend_decade > 0 ? 'warming' : 'not warming'}`, `Annual mean temperature from ERA5-Land. The ${R.year} value (${fx(last, 1)} °C) covers the months available so far.`)}
    ${lineChart([{ vals: t.annual, cls: 'l-temp', dot: true }, { vals: (() => { const ok = t.years.map((y, i) => [y, t.annual[i]]).filter(p => isNum(p[1])); const n = ok.length, mx = ok.reduce((a, p) => a + p[0], 0) / n, my = ok.reduce((a, p) => a + p[1], 0) / n; const b = ok.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / ok.reduce((a, p) => a + (p[0] - mx) ** 2, 0); return t.years.map(y => my + b * (y - mx)); })(), cls: 'l-trend', dash: true }], t.years.map(y => "'" + String(y).slice(2)), { fmt: v => fx(v, 1) + '°', pad: true, every: 5, title: 'Annual mean temperature' })}
    <div class="key"><span><i class="line" style="background:var(--gold)"></i>Annual mean</span><span><i class="line" style="background:var(--red)"></i>Linear trend since ${t.years[0]}</span></div>`); };

VIEWS.climate.drought = R => P(`${verdict(chip('SPI ' + sgn(R.rain.spi3_latest, 1), spiCls(R.rain.spi3_latest)), R.rain.spi_class, 'The Standardised Precipitation Index compares the last three months of rain with 1991–2020, using a gamma distribution fitted for each calendar month. The shaded band is near normal; below −1.5 is severe drought.')}
  ${diverging(R.rain.spi3, { lim: 3, fmt: v => (v > 0 ? '+' : '') + v, pos: 'b-wet', neg: 'b-dry', bands: [[-1, 1]], title: 'SPI-3 by month' })}`);

VIEWS.climate.ind = R => { const s = R.season, od = s.onset && isNum(s.onset_normal_doy) ? doyOf(s.onset) - s.onset_normal_doy : null, cd = s.cessation && isNum(s.cessation_normal_doy) ? doyOf(s.cessation) - s.cessation_normal_doy : null;
  const row = (a, b, c, d) => `<tr><td>${a}</td><td class="n">${b}</td><td class="n">${c}</td><td class="n">${d}</td></tr>`;
  const dd = v => v == null ? '–' : v === 0 ? 'On time' : v > 0 ? v + ' d late' : -v + ' d early';
  return P(`${verdict(chip(s.onset ? 'Season under way' : 'Onset not detected', s.onset ? 'good' : 'warn'), od == null ? (s.onset ? 'Rains have started' : 'Waiting for the rains') : od === 0 ? 'Rains started on time' : `Rains started ${Math.abs(od)} days ${od > 0 ? 'late' : 'early'}`, `Detected from daily CHIRPS rainfall to ${fmtDate(s.last_date)}. Normals are the 1998–2020 averages.`)}
  <div class="tbl-wrap"><table><thead><tr><th>Indicator</th><th class="n">${R.year}</th><th class="n">Normal</th><th class="n">Change</th></tr></thead><tbody>
  ${row('Onset of rains', fmtDay(s.onset), doyStr(s.onset_normal_doy), dd(od))}
  ${row('End of rains', s.cessation ? fmtDay(s.cessation) : 'Not yet', doyStr(s.cessation_normal_doy), dd(cd))}
  ${row('Length of season', isNum(s.los) ? s.los + ' d' : '–', isNum(s.los_normal) ? s.los_normal + ' d' : '–', isNum(s.los) && isNum(s.los_normal) ? sgn(s.los - s.los_normal) + ' d' : '–')}
  ${row('Rainy days (≥1 mm)', fx(s.rainy_days), fx(s.rainy_days_normal), '–')}
  ${row('Dry spells, 7+ days', fx(s.dry_spells), fx(s.dry_spells_normal, 1), '–')}
  </tbody></table></div>
  <p class="note">Onset: first 3-day spell with at least 20 mm, not followed by a week-long dry spell within 30 days. Rainy days so far this year are compared with a full normal year.</p>`); };

VIEWS.water.surface = R => { const w = R.water;
  return P(`<div class="split"><div class="stack-v"><div id="m2" class="lmap"></div><div class="sw"><span><i style="background:#1f6fb5"></i>Water detected by Sentinel-1 radar</span></div>${mapMissing()}</div>
  <div class="stack-v">${verdict(chip(isNum(w.pct) ? fx(w.pct) + '% of normal' : 'No baseline', !isNum(w.pct) ? 'neu' : w.pct < 75 ? 'warn' : w.pct > 125 ? 'neu' : 'good'), `${fx(w.current_km2, 0)} km² of surface water`, `Open water detected in ${esc(R.name)} during ${MONTH[Number(w.month.slice(5)) - 1]} ${w.month.slice(0, 4)}, compared with the same month in 2017–2021. Radar sees through cloud, so this works in the rainy season.`)}
  <div class="facts">${fact('This month', fx(w.current_km2, 0) + ' km²', '')}${fact('Usual', fx(w.normal_km2, 0) + ' km²', '2017–2021')}${fact('Permanent', fx(w.permanent_km2, 0) + ' km²', 'JRC, ≥75% of the time')}</div></div></div>`); };
AFTER.water.surface = () => regionMap('m2', 'water');

VIEWS.water.stress = R => { const b = R.balance, ai = b.aridity, aic = !isNum(ai) ? '–' : ai < .5 ? 'Semi-arid' : ai < .65 ? 'Dry sub-humid' : ai < 1 ? 'Moist sub-humid' : 'Humid';
  return P(`${verdict(chip(b.deficit_months + ' deficit months', b.deficit_months >= 7 ? 'warn' : 'good'), `${b.deficit_months} months where crops need more water than falls`, 'Bars show rainfall minus potential evapotranspiration (MODIS), the water crops and soil would lose. Below zero is a deficit. Faded bars use the normal for months not yet observed.')}
    ${diverging(b.balance, { fmt: v => (v > 0 ? '+' : '') + Math.round(v), pos: 'b-wet', neg: 'b-dry', title: 'Monthly water balance in mm', faded: b.projected })}
    <div class="facts">${fact('Aridity index', fx(ai, 2), aic)}${fact('Rain this year', fx(R.rain.total) + ' mm', 'to ' + MON[R.rain.last_month - 1])}</div>`); };

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
  const f = regionFeature(state.region); m.fitBounds(L.geoJSON(f).getBounds());
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
      <li><strong>Boundaries:</strong> geoBoundaries ADM1 for Ghana's 16 regions (CC BY 4.0).</li>
    </ul>
    <h3>Methods</h3>
    <ul>
      <li><strong>Normals</strong> use 1991–2020 (WMO standard) for rainfall totals and temperature, 1998–2020 for daily season indicators, and 2001–2020 for vegetation.</li>
      <li><strong>SPI-3</strong> fits a gamma distribution, with a probability of zero rain, to three-month totals for each calendar month (McKee et al., 1993).</li>
      <li><strong>Onset</strong> is the first 3-day spell with at least 20 mm after 1 April (north) or 1 March (south), not followed by 7 dry days within 30 days. <strong>Cessation</strong> is the first wet day after 1 September (north) or 15 October (south) followed by less than 10 mm in 20 days.</li>
      <li><strong>Vegetation condition (VCI)</strong> is a standardised form of Kogan's (1995) index: how far this month's regional NDVI is from the same month in other years since 2001, scaled to 0–100 where 50 is typical. Changes smaller than the satellite's noise (0.04 NDVI) cannot reach the extremes. Only complete months are used.</li>
      <li><strong>Crop suitability</strong> scores growing-season rainfall (annual crops) or annual rainfall (perennials), mean temperature and rainy-season length against simplified FAO ECOCROP ranges. Soil is not yet included.</li>
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
async function boot() {
  try {
    [D.meta, D.geo] = await Promise.all([getJSON('data/meta.json'), getJSON('data/regions.geojson')]);
    if (D.meta.farms) D.farms = await getJSON('data/farms.json').catch(() => null);
  } catch (e) {
    document.body.innerHTML = `<p class="loading">Could not load data (${esc(e.message)}). Run the pipeline or <code>python pipelines/make_sample_data.py</code> first.</p>`; return;
  }
  if (D.meta.sample) { const b = $('#banner'); b.hidden = false; b.textContent = 'Sample data: the Earth Engine pipeline has not run yet, so figures are simulated.'; }
  if (!summary(state.region)) state.region = 'northern';
  $('#region').innerHTML = D.meta.regions.map(r => `<option value="${r.key}">${esc(r.name)}</option>`).join('');
  $('#region').value = state.region;
  $('#region').onchange = e => { state.region = e.target.value; save(); route(); };
  $('#asof').textContent = `Rain to ${fmtDay(D.meta.rain_latest)} ${D.meta.rain_latest.slice(0, 4)}`;
  buildLanding();
  window.addEventListener('hashchange', route);
  route();
}
boot();
})();
