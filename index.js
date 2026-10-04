// Recolector de eventos de Nuevo León.
// Uso: node collector/index.js   (escribe data/events.json)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const u = require('./util');

const SOURCES = [
  'cartelera_escenica', 'arema', 'superboletos', 'ticketmaster', 'conciertos_mty', 'conarte_agenda', 'cineteca', 'santa_lucia',
  'nuevoleon_travel', 'allevents', 'ctxplorer', 'marco', 'tres_museos', 'cintermex',
  'foro_corona', 'fever', 'primetickets', 'osuanl', 'ballet_mty', 'sanpedro_vive', 'sanpedro_parques',
  'chipinque',
].map((id) => require(`./${id}`));

// Páginas de tu lista que NO se leen directamente, y por qué (la app las muestra en "Fuentes").
const NOT_INCLUDED = [
  { name: 'Cinemex', home: 'https://cinemex.com/cartelera/zona-48/monterrey', status: 'excluido', reason: 'Cine comercial: se dejó fuera a propósito para no saturar la lista.' },
  { name: 'Cinépolis', home: 'https://cinepolis.com/cartelera/monterrey', status: 'excluido', reason: 'Cine comercial: se dejó fuera a propósito para no saturar la lista.' },
  { name: 'Parque Cinema', home: 'https://www.facebook.com/ParqueCinema/', status: 'no disponible', reason: 'Sólo publica su cartelera en Facebook (no viene ni en el calendario ni en el PDF de San Pedro + Parques).' },
  { name: 'Clases semanales en parques de San Pedro', home: 'https://sanpedroparques.mx/calendario-eventos/', status: 'no disponible', reason: 'Yoga, tai chi, pilates, etc. vienen en el PDF del mes ("Descarga los calendarios vigentes"). La app sólo incluye las actividades especiales.' },
  { name: 'Eventbrite Monterrey', home: 'https://www.eventbrite.com.mx/d/mexico--monterrey/events/', status: 'no disponible', reason: 'Bloquea la lectura automática desde el servidor (error 405). Conferencias, fiestas y talleres independientes.' },
  { name: 'Museo Arquidiocesano', home: 'https://www.facebook.com/museoarquidiocesanodeartesacro/', status: 'no disponible', reason: 'Su página no tiene agenda; anuncia exposiciones y conciertos sólo en Facebook.' },
  { name: 'Arquidiócesis de Monterrey', home: 'https://www.arquidiocesismty.org/arquimty/', status: 'no disponible', reason: 'Sólo publica noticias, sin fechas de eventos.' },
  { name: 'Comisión de Música Sacra', home: 'https://www.facebook.com/comisiondemusicasacramty/', status: 'no disponible', reason: 'Su página no tiene calendario; publica en Facebook.' },
  { name: 'Arena Monterrey', home: 'https://www.arenamonterrey.com/', status: 'indirecto', reason: 'Sus eventos llegan por Ticketmaster y SuperBoletos.' },
  { name: 'Auditorio Banamex', home: 'https://www.auditoriocitibanamex.com.mx/', status: 'indirecto', reason: 'Sus eventos llegan por Ticketmaster y Cartelera Escénica.' },
  { name: 'Showcenter Complex', home: 'https://www.showcenter.com.mx/eventos', status: 'indirecto', reason: 'Sus eventos llegan por Ticketmaster y SuperBoletos.' },
  { name: 'Estadio Walmart', home: 'https://concerts50.com/es/venues/mexico/monterrey/walmart-park', status: 'indirecto', reason: 'Sus eventos llegan por Ticketmaster.' },
];

const OUT = path.join(__dirname, 'events.json'); // todo vive en la raíz del repositorio
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const MAX_DAYS_AHEAD = 240;

async function get(url, kind, body, form) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: body || form ? 'POST' : 'GET',
        body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined,
        headers: { 'User-Agent': UA, 'Accept-Language': 'es-MX,es;q=0.9', Accept: kind === 'json' ? 'application/json' : 'text/html,*/*',
          ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' } : {}),
          ...(body ? { 'Content-Type': 'application/json', ...(/arema\.mx/.test(url) ? { Origin: 'https://arema.mx', Referer: 'https://arema.mx/' } : {}) } : {}) },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url.replace(/apikey=[^&]+/, 'apikey=***')}`);
      return kind === 'json' ? await res.json() : await res.text();
    } catch (e) { lastErr = e; await u.sleep(1500); }
  }
  throw lastErr;
}
const http = { text: (url) => get(url, 'text'), json: (url) => get(url, 'json'), post: (url, body) => get(url, 'json', body || {}), form: (url, data) => get(url, 'json', null, data) };

// ---------- Normalización ----------
const CATS = [
  ['Música', /m[uú]sica|concierto|music|candlelight|sinf[oó]n|orquesta|jazz|rock|pop|banda/i],
  ['Teatro', /teatro|musical|danza|ballet|[oó]pera|stand ?up|comedia|monólogo|mon[oó]logo|clown|t[ií]teres|pastorela|esc[eé]nic/i],
  ['Cine', /\bcine\b|pel[ií]cula|proyecci[oó]n|film/i],
  ['Exposiciones', /exposici|muestra|bienal|galer|artes? pl[aá]stic|artes visuales/i],
  ['Museos', /museo|visita guiada|recorrido/i],
  ['Ferias y expos', /feria|expo\b|expo |convenci|festival/i],
  ['Talleres y charlas', /taller|curso|clases? de|huerto|club del libro|meditaci|conferencia|charla|coloquio|seminario|presentaci[oó]n de libro|conversatorio|club de lectura|diplomado/i],
  ['Deportes', /deporte|disc golf|slackline|basquetbol|yoga|pilates|zumba|tai ?chi|capoeira|running|corredores|tenis|softball|roundnet|skate|bienestar|carrera|marat[oó]n|10k|21k|futbol|f[uú]tbol|b[eé]isbol|lucha|box|b[aá]squet|globetrotters/i],
  ['Familiar', /infantil|niñ[oa]s|familia|cuentacuentos/i],
  ['Experiencias', /experienc|inmersiv/i],
];
const TALLER = /^(taller|conferencia|clase maestra|conversatorio|charla|pechakucha|curso|seminario|congreso|di[aá]logos)|congreso|conferencia/i;
const MUSIC_VENUES = /arena monterrey|auditorio (banamex|citibanamex)|escenario gnp|caf[eé] iguana|showcenter|foro corona|estadio|rinc[oó]n tostitos|foro urbano|venue 867/i;
const THEATER_VENUES = /teatro|auditorio luis elizondo|aula magna|auditorio san pedro|casa de la cultura|foro de las artes/i;
function categorize(e) {
  if (TALLER.test(e.title || '')) return 'Talleres y charlas';
  const hay = `${e.category || ''}`;
  for (const [name, re] of CATS) if (re.test(hay)) return name;
  const text = `${e.title} ${e.description || ''}`;
  for (const [name, re] of CATS) if (re.test(text)) return name;
  if (MUSIC_VENUES.test(e.venue || '')) return 'Música';
  // Sin pistas en el título: si es en un teatro/auditorio escénico, casi siempre es una obra (ej. El Retrato de Dorian Gray).
  if (THEATER_VENUES.test(e.venue || '')) return 'Teatro';
  return 'Otros';
}

const STOP = new Set(['de', 'la', 'el', 'los', 'las', 'en', 'y', 'del', 'con', 'a', 'monterrey', 'mty', 'tour', 'concierto', 'the', 'live', '2026', '2027', 'presenta', 'gira', 'por', 'al', 'in', 'at', 'vs', 'feat', 'ft']);
const tokens = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w));
const day = (iso) => (iso || '').slice(0, 10);
// "Karol G en Estadio BBVA" → "Karol G": el recinto no forma parte del nombre del evento.
const VENUE_TAIL = /\s+(en|@)\s+(el |la )?(arena|estadio|auditorio|foro|teatro|escenario|explanada|parque|showcenter|caf[eé]|rinc[oó]n|jard[ií]n|metapatio|venue|plaza|centro|cintermex|fundidora|sala|museo|monterrey|mty)\b.*$/i;
// Boletos "extra" que no son otro evento: meet & greet, suites, paquetes VIP, etc.
const ADDON = /meet\s*(&|and|y)?\s*greet|\bm\s*&\s*g\b|\bsuites?\b|backstage pass|upgrade|\bnumerado\b|\bvip\b|estacionamiento|parking|paquete/i;
const ADDON_WORDS = new Set(['meet', 'greet', 'mg', 'suite', 'suites', 'backstage', 'pass', 'upgrade', 'numerado', 'vip', 'estacionamiento', 'parking', 'paquete', 'dic', 'world', 'global']);
const titleTokens = (t) => tokens((t || '').replace(VENUE_TAIL, '')).filter((w) => !ADDON_WORDS.has(w));
const GENERIC = new Set(['candlelight', 'tributo', 'festival', 'cine', 'expo', 'taller', 'conferencia', 'clase', 'maestra', 'conversatorio', 'mesa', 'fisl', 'temporada', 'teatro', 'noche', 'gran', 'show', 'fiesta']);

const minutes = (iso) => (iso && iso.length > 10 ? +iso.slice(11, 13) * 60 + +iso.slice(14, 16) : null);
function sameEvent(a, b) {
  const addon = ADDON.test(a.title || '') || ADDON.test(b.title || '');
  if (a.source && a.source === b.source && !addon) return false; // una misma fuente nunca se duplica a sí misma (salvo boletos extra)
  if (day(a.start) !== day(b.start)) return false;
  const A = new Set(titleTokens(a.title)), B = new Set(titleTokens(b.title));
  if (!A.size || !B.size) return false;
  const same = [...A].join(' ') === [...B].join(' ');
  const ma = minutes(a.start), mb = minutes(b.start);
  // Mismo nombre exacto: se tolera más diferencia de hora (apertura de puertas vs. inicio).
  if (ma != null && mb != null && Math.abs(ma - mb) > (same ? 180 : 90)) return false;
  if (same) return true;
  const inter = [...A].filter((w) => B.has(w)).length;
  const [small] = A.size <= B.size ? [A] : [B];
  if (inter === small.size || inter / (A.size + B.size - inter) > 0.5) return true;
  // "Yolanda del Río – La Gran Señora" vs "Yolanda del Rio, El Gran Regreso": mismo artista, misma hora.
  const fa = [...A].slice(0, 2), fb = [...B].slice(0, 2);
  return ma === mb && fa.length === 2 && fa.join() === fb.join() && !fa.some((w) => GENERIC.has(w));
}

function score(e) { // qué tan completo está un registro (para elegir el "principal" al fusionar)
  return (e.start && e.start.length > 10 ? 3 : 0) + (e.venue ? 2 : 0) + (e.price ? 2 : 0) + (e.image ? 1 : 0) + (e.end ? 0.5 : 0);
}

// Gratis: lo dice el precio o la descripción ("entrada libre", "gratuito"...), o es de una fuente que siempre es gratis.
const FREE_TXT = /entrada libre|gratis|gratuit|sin costo|acceso libre|entrada gratuita/i;
const FREE_SOURCES = new Set(['sanpedro_parques']); // clases y actividades en parques de San Pedro
const isFreeRec = (e) => FREE_SOURCES.has(e.source) || FREE_TXT.test(e.price || '') || FREE_TXT.test(e.description || '');
const SRC_NAME = (id) => ((SOURCES.find((x) => x.id === id) || {}).name || id).replace(/\s*\(.*\)$/, '');

function merge(list) {
  const out = [];
  for (const e of list) {
    const twin = out.find((x) => (!x._src.has(e.source) || ADDON.test(e.title) || ADDON.test(x.title)) && sameEvent({ ...x, source: x._src.has(e.source) ? e.source : null }, e));
    if (!twin) {
      const rec = { ...e, _src: new Set([e.source]), sources: [{ id: e.source, url: e.url }] };
      if (isFreeRec(e)) { rec.free = true; rec.freeVia = SRC_NAME(e.source); }
      out.push(rec); continue;
    }
    if (!twin._src.has(e.source)) twin.sources.push({ id: e.source, url: e.url });
    twin._src.add(e.source);
    const eAddon = ADDON.test(e.title), tAddon = ADDON.test(twin.title);
    // El boleto "normal" manda sobre el meet & greet / suites; si no, el registro más completo.
    const best = eAddon !== tAddon ? (eAddon ? twin : e) : score(e) > score(twin) ? e : twin;
    const other = best === e ? twin : e;
    for (const k of ['title', 'start', 'end', 'venue', 'city', 'price', 'image', 'tickets', 'description', 'times', 'onsale', 'promo']) {
      twin[k] = best[k] != null && best[k] !== '' ? best[k] : other[k];
    }
    if (twin.category === 'Otros' && e.category !== 'Otros') twin.category = e.category;
    for (const k of ['demand', 'soldOut', 'waitlist']) if (e[k]) twin[k] = e[k];
    // El mismo show gratis en una fuente (ej. Festival Santa Lucía) y con costo en una boletera: manda el gratis.
    if (isFreeRec(e) && !twin.free) { twin.free = true; twin.freeVia = SRC_NAME(e.source); }
    if (twin.free && !FREE_TXT.test(twin.price || '')) { if (twin.price) twin.paidPrice = twin.price; twin.price = 'Entrada libre'; }
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
    if (list.length === 1) { out.push({ id: hash(`${key}|${day(list[0].start)}`), skey: key, ...list[0] }); continue; }
    const base = list.reduce((best, e) => (score(e) > score(best) ? e : best), list[0]);
    const dates = [];
    const seen = new Set();
    for (const e of list) {
      if (seen.has(e.start)) continue;
      seen.add(e.start);
      const d = { start: e.start, end: e.end && day(e.end) !== day(e.start) ? e.end : null, url: e.url };
      // Disponibilidad por función (Fever): agotada / últimos boletos y precio de esa función.
      if (e.avail) { d.avail = e.avail; if (e.left != null) d.left = e.left; }
      if (e.price && e.price !== base.price) d.price = e.price;
      dates.push(d);
    }
    const sources = [];
    for (const s of list.flatMap((e) => e.sources)) if (!sources.some((x) => x.id === s.id)) sources.push(s);
    const lastEnd = list.map((e) => e.end || e.start).sort().pop();
    const flags = {};
    for (const k of ['demand', 'waitlist', 'promo', 'onsale', 'free', 'freeVia', 'paidPrice']) { const f = list.find((e) => e[k]); if (f) flags[k] = f[k]; }
    if (list.every((e) => e.soldOut)) flags.soldOut = true;
    const { avail, left, ...rest } = base; // la disponibilidad va por función, no en el evento
    out.push({ ...rest, ...flags, skey: key, id: hash(key), start: dates[0].start, end: lastEnd, url: dates[0].url || base.url, dates, sources });
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
      if (raw.warning) h.warning = raw.warning;
      if (h.ok) h.lastSuccess = h.checkedAt;
    } catch (e) {
      h.error = e.message;
      if (e.skip) h.skipped = true;
    }
    h.ms = Date.now() - t0;
    health.push(h);
    console.log(`${h.ok ? '✔' : h.skipped ? '–' : '✘'} ${src.name.padEnd(26)} ${String(h.count).padStart(4)} eventos  ${h.error || ''}${h.warning ? ' ⚠ ' + h.warning : ''}`);
  }

  // Más completos primero, para que sean la base al fusionar.
  all.sort((a, b) => score(b) - score(a));
  const merged = groupSeries(
    merge(all).map(({ _src, source, url, ...e }) => ({ ...e, url: url || (e.sources[0] && e.sources[0].url) }))
  ).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.title.localeCompare(b.title)));

  // Alta demanda para TODAS las fuentes: además de la marca de Fever, se busca en título y descripción
  // lo que los organizadores escriben cuando algo se vende bien ("agotado", "nueva fecha", "función adicional"…).
  const HOT_TEXT = /(agotad[oa]s?|sold ?out|[uú]ltimos boletos|[uú]ltimas entradas|[uú]ltimos lugares|nueva fecha|segunda fecha|fecha adicional|funci[oó]n(es)? adicional(es)?|por alta demanda|abrimos (otra|nueva) fecha)/i;
  for (const e of merged) {
    if (e.demand) continue;
    const m = `${e.title} ${e.description || ''}`.match(HOT_TEXT);
    if (m) { e.demand = 'alta'; e.demandWhy = m[0].toLowerCase(); }
  }

  // "Nuevos" y "más fechas": se compara contra la lista anterior por título+lugar.
  const prevByKey = {};
  for (const e of prev.events || []) if (e.skey) prevByKey[e.skey] = e;
  const tracking = (prev.events || []).some((e) => e.firstSeen);
  const nowIso = new Date().toISOString();
  for (const e of merged) {
    const p = prevByKey[e.skey];
    e.firstSeen = p && p.firstSeen ? p.firstSeen : tracking ? nowIso : '2000-01-01T00:00:00Z';
    const nNow = (e.dates || []).length || 1;
    const nPrev = p ? (p.dates || []).length || 1 : nNow;
    if (p && nNow > nPrev) e.moreDatesAt = nowIso; // agregaron funciones: casi siempre porque se agotó la primera
    else if (p && p.moreDatesAt) e.moreDatesAt = p.moreDatesAt;
  }

  const data = { generatedAt: nowIso, timezone: 'America/Monterrey', total: merged.length, sources: health, notIncluded: NOT_INCLUDED, events: merged };
  if (!only) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(data, null, 1));
  }
  console.log(`\nTotal: ${all.length} registros → ${merged.length} eventos únicos`);
  return data;
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { main, merge, groupSeries, categorize, sameEvent };
