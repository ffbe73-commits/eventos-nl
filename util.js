// Utilidades compartidas. Sin dependencias: corre igual en Node y en el navegador.
const MESES = {
  enero: 1, ene: 1, jan: 1, january: 1,
  febrero: 2, feb: 2, february: 2,
  marzo: 3, mar: 3, march: 3,
  abril: 4, abr: 4, apr: 4, april: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6, june: 6,
  julio: 7, jul: 7, july: 7,
  agosto: 8, ago: 8, aug: 8, august: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, september: 9,
  octubre: 10, oct: 10, october: 10,
  noviembre: 11, nov: 11, november: 11,
  diciembre: 12, dic: 12, dec: 12, december: 12,
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };

function decode(s) {
  return String(s == null ? '' : s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] != null ? ENTITIES[n.toLowerCase()] : m));
}

function clean(s) {
  return decode(String(s == null ? '' : s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// Monterrey usa UTC-6 todo el año (sin horario de verano desde 2022).
function nowMty() {
  return new Date(Date.now() - 6 * 3600 * 1000);
}
function todayMty() {
  const n = nowMty();
  return ymd(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate());
}
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// Convierte cualquier fecha ISO (con o sin zona) a hora local de Monterrey "YYYY-MM-DDTHH:mm".
// Si viene solo la fecha, regresa "YYYY-MM-DD".
function toLocal(iso) {
  if (!iso) return null;
  const s = String(iso).trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const zone = s.slice(16).match(/(Z|[+-]\d{2}:?\d{2})$/);
  if (!zone || /^-06:?00$/.test(zone[1])) return `${m[1]}T${m[2]}:${m[3]}`;
  const t = new Date(s);
  if (isNaN(t)) return `${m[1]}T${m[2]}:${m[3]}`;
  const l = new Date(t.getTime() - 6 * 3600 * 1000);
  return `${ymd(l.getUTCFullYear(), l.getUTCMonth() + 1, l.getUTCDate())}T${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}`;
}

// "8:00 p.m.", "20:30 h.", "09:00 PM", "Jueves 15:00 hrs" -> "HH:mm"
function parseTime(str) {
  if (!str) return null;
  const m = String(str).toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|h(?:rs?|oras)?\.?)/) ||
    String(str).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = (m[3] || '').replace(/[\s.]/g, '');
  if (ap.startsWith('p') && h < 12) h += 12;
  if (ap.startsWith('a') && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

// Elige el año: si no viene, usa el año en curso o el siguiente si la fecha ya pasó hace más de 2 meses.
function inferYear(month, day, year) {
  if (year) return +year;
  const n = nowMty();
  const y = n.getUTCFullYear();
  const candidate = Date.UTC(y, month - 1, day);
  return candidate < n.getTime() - 60 * 864e5 ? y + 1 : y;
}

const normWord = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.$/, '');

// Lee fechas en español o inglés:
// "Martes 6 de octubre, 2026", "1 de octubre 2026", "03 y 04 de octubre 2026",
// "Del 04 de octubre al 01 de noviembre 2026", "Del 01 al 29 de octubre 2026",
// "10-18 Oct", "04 oct 2026, 8:00 p.m.", "Thu, 15 Oct, 2026 - 09:00 PM", "23/10/2026"
// Regresa { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD'|null, time: 'HH:mm'|null } o null.
function parseDateText(text, fallbackYear) {
  if (!text) return null;
  const s = clean(text);
  const time = parseTime(s.replace(/\d{1,2}\/\d{1,2}\/\d{4}/, ''));

  const dmy = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (dmy) return { start: ymd(+dmy[3], +dmy[2], +dmy[1]), end: null, time };

  // Busca pares "día ... mes" en orden
  const re = /(\d{1,2})(?:\s*(?:y|al|-|–|a)\s*(\d{1,2}))?\s*(?:de\s+)?([a-záéíóúñ]{3,10})\.?(?:,?\s*(?:de\s+)?(\d{4}))?/gi;
  const parts = [];
  let m;
  while ((m = re.exec(s))) {
    const mon = MESES[normWord(m[3])];
    if (!mon) continue;
    parts.push({ d1: +m[1], d2: m[2] ? +m[2] : null, mon, year: m[4] ? +m[4] : null, idx: m.index });
  }
  // "Del 04 de octubre al 01 de noviembre 2026" -> año sólo al final
  const yearAny = (s.match(/\b(20\d{2})\b/) || [])[1];
  if (parts.length) {
    const a = parts[0];
    const yA = a.year || (parts[1] && parts[1].year) || (yearAny ? +yearAny : null) || fallbackYear;
    const startY = inferYear(a.mon, a.d1, yA);
    const start = ymd(startY, a.mon, a.d1);
    let end = null;
    if (a.d2 && a.d2 >= a.d1) end = ymd(startY, a.mon, a.d2);
    if (parts[1] && /\b(al|a|-|–|hasta)\b|–|-/.test(s.slice(a.idx, parts[1].idx + 3))) {
      const b = parts[1];
      let yB = b.year || yA || startY;
      if (b.mon < a.mon && !b.year) yB = startY + 1;
      end = ymd(inferYear(b.mon, b.d1, yB), b.mon, b.d1);
    }
    return { start, end, time };
  }
  // "Oct 15, 2026" (inglés, mes primero)
  const en = s.match(/\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{4})?/i);
  if (en && MESES[normWord(en[1])]) {
    const mon = MESES[normWord(en[1])];
    return { start: ymd(inferYear(mon, +en[2], en[3]), mon, +en[2]), end: null, time };
  }
  return null;
}

// Extrae todos los objetos schema.org de tipo *Event de los bloques JSON-LD.
function jsonLdEvents(html) {
  const out = [];
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((x) => x[1]);
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    const t = [].concat(o['@type'] || []);
    if (t.some((x) => /Event$/.test(x))) out.push(o);
    for (const k of ['@graph', 'itemListElement', 'item', 'mainEntity', 'event', 'events', 'subEvent']) if (o[k]) walk(o[k]);
  };
  for (const b of blocks) {
    try { walk(JSON.parse(b.trim())); } catch (e) { /* bloque inválido: se ignora */ }
  }
  return out;
}

function priceFromOffers(offers) {
  const list = [].concat(offers || []);
  const nums = list.flatMap((o) => [o.price, o.lowPrice, o.highPrice]).map(Number).filter((n) => n > 0);
  if (!nums.length) return null;
  const lo = Math.min(...nums), hi = Math.max(...nums);
  return lo === hi ? `$${lo}` : `$${lo} – $${hi}`;
}

function fromJsonLd(e) {
  const loc = [].concat(e.location || [])[0] || {};
  const addr = loc.address || {};
  return {
    title: clean(e.name),
    start: toLocal(e.startDate),
    end: toLocal(e.endDate),
    venue: clean(loc.name || ''),
    city: clean(typeof addr === 'string' ? '' : addr.addressLocality || ''),
    price: priceFromOffers(e.offers),
    url: e.url || ([].concat(e.offers || [])[0] || {}).url || null,
    image: [].concat(e.image || [])[0] || null,
    genre: e.genre || null,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const util = { MESES, decode, clean, pad, ymd, nowMty, todayMty, addDays, toLocal, parseTime, inferYear, parseDateText, jsonLdEvents, priceFromOffers, fromJsonLd, sleep };
if (typeof module !== 'undefined') module.exports = util;
