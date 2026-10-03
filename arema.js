// Arema Ticket: su página es una app, pero usa una API pública (POST) con el catálogo completo.
// 1) events/list trae todos los eventos del país → filtramos Nuevo León.
// 2) events/get trae cada evento con sus funciones (fechas) y sinopsis.
const API = 'https://t3lb.arema.mx/public';
const CATS = { Teatro: 'Teatro', Concierto: 'Música', Comediantes: 'Teatro', Familiares: 'Familiar', Deportes: 'Deportes', Especiales: 'Experiencias', Festivales: 'Música', Danza: 'Teatro', Cultura: 'Exposiciones' };

const slug = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9! -]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
// Arema guarda la hora en segundos UTC; Monterrey es UTC-6.
const localIso = (secs, u) => u.toLocal(new Date(secs * 1000).toISOString());

module.exports = {
  id: 'arema',
  name: 'Arema',
  home: 'https://arema.mx/',
  async run(http, u) {
    const post = (path, body) => http.post(`${API}/${path}`, body);
    const list = await post('events/list', {});
    if (!list || list.error || !list.data) throw new Error(`Arema respondió: ${(list && list.message) || 'sin datos'}`);
    const nl = (list.data.events || []).filter((e) => /nuevo le/i.test(e.state || ''));
    const out = [];
    for (const e of nl) {
      const url = `https://arema.mx/e/${e.event_id}-${slug(e.event_name)}`;
      let detail = null;
      try { const g = await post('events/get', { event_id: e.event_id }); detail = g && !g.error ? g.data : null; } catch (err) { /* usamos sólo la lista */ }
      const dates = ((detail && detail.dates) || []).filter((d) => d.active !== false && d.date);
      const base = {
        title: u.clean(e.event_name),
        venue: u.clean(e.venue_name || ''),
        city: u.clean(e.city || ''),
        category: CATS[e.category_name] || e.category_name || null,
        price: null,
        url,
        tickets: url,
        image: null,
        description: detail && detail.sinopsis ? u.summary(detail.sinopsis.replace(/\*\*/g, '')) : null,
      };
      if (dates.length) {
        for (const d of dates) {
          out.push({ ...base, start: localIso(d.date, u), end: d.date_end && d.date_end > d.date ? localIso(d.date_end, u) : null,
            venue: u.clean(d.venue_name || base.venue), city: u.clean(d.city || base.city) });
        }
      } else if (e.date) {
        out.push({ ...base, start: localIso(e.date, u), end: null });
      }
      await u.sleep(200);
    }
    return out;
  },
};
