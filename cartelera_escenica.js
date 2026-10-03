// Cartelera Escénica: API pública de "The Events Calendar" (WordPress).
module.exports = {
  id: 'cartelera_escenica',
  name: 'Cartelera Escénica',
  home: 'https://carteleraescenica.com/cartelera/',
  async run(http, u) {
    const start = u.todayMty();
    const end = u.addDays(start, 180);
    const out = [];
    for (let page = 1; page <= 10; page++) {
      const url = `https://carteleraescenica.com/wp-json/tribe/events/v1/events?per_page=50&page=${page}&start_date=${start}&end_date=${end}`;
      const j = await http.json(url);
      for (const e of j.events || []) {
        const v = e.venue && !Array.isArray(e.venue) ? e.venue : {};
        out.push({
          title: u.clean(e.title),
          start: e.all_day ? e.start_date.slice(0, 10) : u.toLocal(e.start_date),
          end: e.all_day ? e.end_date.slice(0, 10) : u.toLocal(e.end_date),
          venue: u.clean(v.venue || ''),
          city: u.clean(v.city || ''),
          category: (e.categories && e.categories[0] && u.clean(e.categories[0].name)) || null,
          price: e.cost ? u.clean(e.cost) : null,
          url: e.url,
          tickets: e.website && /^https?:/.test(u.decode(e.website)) ? u.decode(e.website).split('?')[0] : null,
          image: e.image && e.image.url ? e.image.url : null,
        });
      }
      if (!j.total_pages || page >= j.total_pages) break;
    }
    return out;
  },
};
