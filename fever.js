// Fever: la página de la ciudad trae los "planes" (Candlelight, Jazz Room, experiencias...).
// Cada plan tiene VARIAS funciones (ej. 4:30, 6:30 y 9:00 pm el mismo día); esas vienen en la página
// de cada plan, junto con la disponibilidad por zona. Por eso se visita cada plan y se arma una
// fecha por función, con su precio y si quedan pocos boletos o ya se agotó.
const STATE = /<script id="serverapp-state" type="application\/json">([\s\S]*?)<\/script>/;
const MAX_FUNCIONES = 60; // más que esto es algo "diario" (museo, tour): se deja como rango

function sessionsOf(state) {
  const items = [];
  for (const k in state) {
    if (!k.startsWith('LEVEL_TICKET_SELECTOR_SESSIONS')) continue;
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== 'object') return;
      // has_available_tickets == null son extras (ej. "cancelación flexible"), no boletos.
      if (o.starts_at_iso && o.has_available_tickets != null) { items.push(o); return; }
      for (const kk in o) walk(o[kk]);
    };
    walk(state[k]);
  }
  // Agrupar las zonas de cada función por hora de inicio.
  const byTime = new Map();
  for (const z of items) {
    if (!byTime.has(z.starts_at_iso)) byTime.set(z.starts_at_iso, []);
    byTime.get(z.starts_at_iso).push(z);
  }
  return [...byTime.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([iso, zones]) => {
    const open = zones.filter((z) => z.has_available_tickets);
    const prices = zones.map((z) => z.price).filter((p) => p > 0);
    const left = open.reduce((n, z) => n + (Number(z.available_tickets) || 0), 0);
    return {
      iso,
      end: zones[0].ends_at_iso,
      soldOut: open.length === 0,
      // Fever marca last_tickets cuando una zona va por sus últimos boletos.
      // "Últimos boletos" sólo si de verdad queda poco: ≤30 lugares o más de la mitad de las zonas agotadas.
      last: open.length > 0 && (left <= 30 || (zones.length - open.length) * 2 > zones.length),
      left: open.length ? left : 0,
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
    };
  });
}

const money = (n) => `$${Number(n).toLocaleString('es-MX')}`;

module.exports = {
  id: 'fever',
  name: 'Fever',
  home: 'https://feverup.com/es/monterrey',
  async run(http, u) {
    const html = await http.text(this.home);
    const m = html.match(STATE);
    if (!m) throw new Error('No se encontró serverapp-state');
    const state = JSON.parse(m[1]);
    const plans = new Map();
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== 'object') return;
      if (o.plan_id && o.name && o.first_active_session_date) { if (!plans.has(o.plan_id)) plans.set(o.plan_id, o); return; }
      for (const k in o) walk(o[k]);
    };
    walk(state);

    const today = u.todayMty();
    const list = [...plans.values()]
      .filter((p) => !p.location || !p.location.city_code || p.location.city_code === 'MTY')
      .filter((p) => !/tarjeta regalo|gift card/i.test(p.name))
      .filter((p) => String(p.last_active_session_date || p.first_active_session_date).slice(0, 10) >= today);

    // Visitar cada plan (de 4 en 4 para no saturar).
    const detail = new Map();
    let fails = 0;
    for (let i = 0; i < list.length; i += 4) {
      await Promise.all(list.slice(i, i + 4).map(async (p) => {
        try {
          const h = await http.text(`https://feverup.com/m/${p.plan_id}`);
          const mm = h.match(STATE);
          if (mm) detail.set(p.plan_id, sessionsOf(JSON.parse(mm[1])));
        } catch (e) { fails++; }
      }));
    }

    const out = [];
    for (const p of list) {
      const base = {
        title: u.clean(p.name),
        venue: (p.location && !p.location.is_hidden && p.location.name) || '',
        city: 'Monterrey',
        category: /candlelight|jazz room|ballet of lights/i.test(p.name) ? 'Música' : 'Experiencias',
        url: `https://feverup.com/m/${p.plan_id}`,
        image: p.cover_image || null,
        waitlist: !!p.is_wait_list || undefined,
      };
      const ses = (detail.get(p.plan_id) || []).filter((s) => u.toLocal(s.iso).slice(0, 10) >= today);
      // Si la lista de funciones viene incompleta (se corta antes de la última fecha del plan), mejor el rango.
      const lastDay = String(p.last_active_session_date || '').slice(0, 10);
      const complete = ses.length && (!lastDay || u.toLocal(ses[ses.length - 1].iso).slice(0, 10) >= u.addDays(lastDay, -3));
      if (complete && ses.length <= MAX_FUNCIONES) {
        const hot = ses.filter((s) => s.last || s.soldOut);
        for (const s of ses) {
          out.push({
            ...base,
            start: u.toLocal(s.iso),
            end: u.toLocal(s.end),
            price: s.min ? (s.max > s.min ? `${money(s.min)} – ${money(s.max)}` : money(s.min)) : null,
            // Disponibilidad de ESTA función (la app la muestra en la lista de funciones).
            avail: s.soldOut ? 'agotado' : s.last ? 'ultimos' : null,
            left: s.soldOut ? 0 : s.last && s.left ? s.left : undefined,
            demand: hot.length || (p.extra && p.extra.urgency) ? 'alta' : null,
            demandWhy: hot.length ? (hot.some((x) => x.soldOut) ? 'funciones agotadas' : 'últimos boletos') : undefined,
            soldOut: s.soldOut || undefined,
          });
        }
        continue;
      }
      // Sin detalle (o es algo diario): como antes, rango de primera a última función.
      out.push({
        ...base,
        // Fever marca la hora local de Monterrey con '+00:00', así que se toma tal cual.
        start: u.toLocal(String(p.first_active_session_date).slice(0, 19)),
        end: u.toLocal(String(p.last_active_session_date || '').slice(0, 19)),
        price: p.price_info && !p.price_info.hide && p.price_info.amount ? `Desde $${p.price_info.amount}` : null,
        demand: p.extra && p.extra.urgency ? 'alta' : null,
        soldOut: !!p.is_sold_out || undefined,
      });
    }
    if (fails) out.warning = `No se pudo abrir el detalle de ${fails} plan(es); se usó su rango de fechas.`;
    return out;
  },
};
