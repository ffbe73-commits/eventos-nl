// Ticketmaster: API oficial (Discovery API). Requiere la variable TM_API_KEY (gratis en developer.ticketmaster.com).
module.exports = {
  id: 'ticketmaster',
  name: 'Ticketmaster',
  home: 'https://www.ticketmaster.com.mx/discover/monterrey',
  needsKey: 'TM_API_KEY',
  async run(http, u, env) {
    const key = env && env.TM_API_KEY;
    if (!key) { const e = new Error('Falta la clave TM_API_KEY'); e.skip = true; throw e; }
    const out = [];
    const startUtc = new Date().toISOString().slice(0, 19) + 'Z';
    for (let page = 0; page < 5; page++) {
      const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${key}&latlong=25.6866,-100.3161&radius=40&unit=km&countryCode=MX&locale=es-mx&size=200&page=${page}&sort=date,asc&startDateTime=${startUtc}`;
      const j = await http.json(url);
      const evs = (j._embedded && j._embedded.events) || [];
      for (const e of evs) {
        const v = (e._embedded && e._embedded.venues && e._embedded.venues[0]) || {};
        const d = e.dates && e.dates.start ? e.dates.start : {};
        const cls = (e.classifications && e.classifications[0]) || {};
        const seg = cls.segment && cls.segment.name;
        const pr = (e.priceRanges && e.priceRanges[0]) || null;
        const img = (e.images || []).sort((a, b) => b.width - a.width).find((i) => i.ratio === '16_9') || (e.images || [])[0];
        out.push({
          title: u.clean(e.name),
          start: d.localTime ? `${d.localDate}T${d.localTime.slice(0, 5)}` : d.localDate,
          end: null,
          venue: u.clean(v.name || ''),
          city: u.clean((v.city && v.city.name) || ''),
          category: seg === 'Music' ? 'Música' : seg === 'Sports' ? 'Deportes' : seg === 'Arts & Theatre' ? 'Teatro' : seg === 'Film' ? 'Cine' : null,
          price: pr ? (pr.min === pr.max ? `$${pr.min}` : `$${pr.min} – $${pr.max}`) : null,
          url: e.url,
          image: img ? img.url : null,
        });
      }
      const pg = j.page || {};
      if (pg.number == null || pg.number + 1 >= pg.totalPages) break;
      await u.sleep(300);
    }
    return out;
  },
};
