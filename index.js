// Recolector de eventos de Nuevo León.
// Uso: node collector/index.js   (escribe data/events.json)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const u = require('./util');

const SOURCES = [
  'cartelera_escenica', 'ticketmaster', 'conciertos_mty', 'conarte_agenda', 'cineteca',
  'nuevoleon_travel', 'allevents', 'ctxplorer', 'marco', 'tres_museos', 'cintermex',
  'foro_corona', 'fever', 'primetickets',
].map((id) => require(`./sources/${id}`));

const OUT = path.join(__dirname, '..', 'data', 'events.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const MAX_DAYS_AHEAD = 240;

async function get(url, kind) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'es-MX,es;q=0.9', Accept: kind === 'json' ? 'application/json' : 'text/html,*/*' },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url.replace(/apikey=[^&]+/, 'apikey=***')}`);
      return kind === 'json' ? await res.json() : await res.text();
    } catch (e) { lastErr = e; await u.sleep(1500); }
  }
  throw lastErr;
}
const http = { text: (url) => get(url, 'text'), json: (url) => get(url, 'json') };

// ---------- Normalización ----------
const CATS = [
  ['Música', /m[uú]sica|concierto|music|candlelight|sinf[oó]n|orquesta|jazz|rock|pop|banda/i],
  ['Teatro', /teatro|musical|danza|ballet|[oó]pera|stand ?up|comedia|monólogo|mon[oó]logo|clown|t[ií]teres|pastorela|esc[eé]nic/i],
  ['Cine', /cine|pel[ií]cula|proyecci[oó]n|film/i],
  ['Exposiciones', /exposici|muestra|bienal|galer|artes? pl[aá]stic|artes visuales/i],
  ['Museos', /museo|visita guiada|recorrido/i],
  ['Ferias y expos', /feria|expo\b|expo |convenci|festival/i],
  ['Talleres y charlas', /taller|curso|conferencia|charla|coloquio|seminario|presentaci[oó]n de libro|conversatorio|club de lectura|diplomado/i],
  ['Deportes', /deporte|carrera|marat[oó]n|10k|21k|futbol|f[uú]tbol|b[eé]isbol|lucha|box|b[aá]squet|globetrotters/i],
  ['Familiar', /infantil|niñ[oa]s|familia|cuentacuentos/i],
  ['Experiencias', /experienc|inmersiv/i],
];
function categorize(e) {
  const hay = `${e.category || ''}`;
  for (const [name, re] of CATS) if (re.test(hay)) return name;
  const text = `${e.title} ${e.venue || ''}`;
  for (const [name, re] of CATS) if (re.test(text)) return name;
  return 'Otros';
}

const STOP = new Set(['de', 'la', 'el', 'los', 'las', 'en', 'y', 'del', 'con', 'a', 'monterrey', 'mty', 'tour', 'concierto', 'the', 'live', '2026', '2027', 'presenta', 'gira', 'por', 'al']);
const tokens = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w));
const day = (iso) => (iso || '').slice(0, 10);

const minutes = (iso) => (iso && iso.length > 10 ? +iso.slice(11, 13) * 60 + +iso.slice(14, 16) : null);
function sameEvent(a, b) {
  if (a.source && a.source === b.source) return false; // una misma fuente nunca se duplica a sí misma
  if (day(a.start) !== day(b.start)) return false;
  const ma = minutes(a.start), mb = minutes(b.start);
  if (ma != null && mb != null && Math.abs(ma - mb) > 90) return false;
  const A = new Set(tokens(a.title)), B = new Set(tokens(b.title));
  if (!A.size || !B.size) return false;
  const inter = [...A].filter((w) => B.has(w)).length;
  const [small] = A.size <= B.size ? [A] : [B];
  return inter === small.size || inter / (A.size + B.size - inter) > 0.5;
}

function score(e) { // qué tan completo está un registro (para elegir el "principal" al fusionar)
  return (e.start && e.start.length > 10 ? 3 : 0) + (e.venue ? 2 : 0) + (e.price ? 2 : 0) + (e.image ? 1 : 0) + (e.end ? 0.5 : 0);
}

function merge(list) {
  const out = [];
  for (const e of list) {
    const twin = out.find((x) => !x._src.has(e.source) && sameEvent({ ...x, source: null }, e));
    if (!twin) { out.push({ ...e, _src: new Set([e.source]), sources: [{ id: e.source, url: e.url }] }); continue; }
    twin._src.add(e.source);
    twin.sources.push({ id: e.source, url: e.url });
    const best = score(e) > score(twin) ? e : twin;
    const other = best === e ? twin : e;
    for (const k of ['title', 'start', 'end', 'venue', 'city', 'price', 'image', 'tickets', 'description', 'times']) {
      twin[k] = best[k] != null && best[k] !== '' ? best[k] : other[k];
    }
    if (twin.category === 'Otros' && e.category !== 'Otros') twin.category = e.category;
  }
  return out;
}

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

// Junta las funciones de una misma obra/exposición (mismo título y recinto) en un solo evento con su lista de fechas.
function groupSeries(events) {
  const groups = new Map();
  for (const e of events) {
    const key = `${tokens(e.title).join(' ')}|${tokens(e.venue).slice(0, 2).join(' ')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const out = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => (a.start < b.start ? -1 : 1));
    if (list.length === 1) { out.push({ id: hash(`${key}|${day(list[0].start)}`), ...list[0] }); continue; }
    const base = list.reduce((best, e) => (score(e) > score(best) ? e : best), list[0]);
    const dates = [];
    const seen = new Set();
    for (const e of list) {
      if (seen.has(e.start)) continue;
      seen.add(e.start);
      dates.push({ start: e.start, end: e.end && day(e.end) !== day(e.start) ? e.end : null, url: e.url });
    }
    const sources = [];
    for (const s of list.flatMap((e) => e.sources)) if (!sources.some((x) => x.id === s.id)) sources.push(s);
    const lastEnd = list.map((e) => e.end || e.start).sort().pop();
    out.push({ ...base, id: hash(key), start: dates[0].start, end: lastEnd, url: dates[0].url || base.url, dates, sources });
  }
  return out;
}

async function main() {
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { sources: [] };
  const prevById = Object.fromEntries((prev.sources || []).map((s) => [s.id, s]));
  const today = u.todayMty();
  const limit = u.addDays(today, MAX_DAYS_AHEAD);
  const all = [];
  const health = [];
  const only = process.argv[2] ? process.argv[2].split(',') : null;

  for (const src of SOURCES) {
    if (only && !only.includes(src.id)) continue;
    const t0 = Date.now();
    const h = { id: src.id, name: src.name, home: src.home, ok: false, count: 0, error: null, checkedAt: new Date().toISOString(), lastSuccess: (prevById[src.id] || {}).lastSuccess || null };
    try {
      const raw = await src.run(http, u, process.env);
      const evs = raw
        .filter((e) => e && e.title && e.start)
        .filter((e) => (day(e.end) || day(e.start)) >= today && day(e.start) <= limit)
        .map((e) => ({ ...e, source: src.id, category: categorize(e) }));
      all.push(...evs);
      h.ok = evs.length > 0;
      h.count = evs.length;
      if (!evs.length) h.error = raw.length ? 'Sólo trajo eventos pasados' : 'No encontró eventos (¿cambió la página?)';
      if (h.ok) h.lastSuccess = h.checkedAt;
    } catch (e) {
      h.error = e.message;
      if (e.skip) h.skipped = true;
    }
    h.ms = Date.now() - t0;
    health.push(h);
    console.log(`${h.ok ? '✔' : h.skipped ? '–' : '✘'} ${src.name.padEnd(26)} ${String(h.count).padStart(4)} eventos  ${h.error || ''}`);
  }

  // Más completos primero, para que sean la base al fusionar.
  all.sort((a, b) => score(b) - score(a));
  const merged = groupSeries(
    merge(all).map(({ _src, source, url, ...e }) => ({ ...e, url: url || (e.sources[0] && e.sources[0].url) }))
  ).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.title.localeCompare(b.title)));

  const data = { generatedAt: new Date().toISOString(), timezone: 'America/Monterrey', total: merged.length, sources: health, events: merged };
  if (!only) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(data, null, 1));
  }
  console.log(`\nTotal: ${all.length} registros → ${merged.length} eventos únicos`);
  return data;
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { main, merge, groupSeries, categorize, sameEvent };
