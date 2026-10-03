// Eventbrite Monterrey: el listado trae JSON-LD sólo con fecha; la hora y el precio salen de la página de cada evento.
const LIST = 'https://www.eventbrite.com.mx/d/mexico--monterrey/all-events/';

module.exports = {
  id: 'eventbrite',
  name: 'Eventbrite Monterrey',
  home: 'https://www.eventbrite.com.mx/d/mexico--monterrey/events/',
  pages: 5,
  async run(http, u) {
    const items = [];
    for (let p = 1; p <= this.pages; p++) {
      let html;
      try { html = await http.text(`${LIST}?page=${p}`); } catch (e) { if (p === 1) throw e; break; }
      const found = u.jsonLdEvents(html);
      if (!found.length) break;
      items.push(...found);
      await u.sleep(500);
    }
    const out = [];
    const seen = new Set();
    for (const it of items) {
      if (!it.url || seen.has(it.url)) continue;
      seen.add(it.url);
      const loc = [].concat(it.location || [])[0] || {};
      if (loc.address && loc.address.addressRegion && !/NLE|nuevo le/i.test(loc.address.addressRegion)) continue;
      let ev = u.fromJsonLd(it);
      try {
        const detail = u.jsonLdEvents(await http.text(it.url)).map(u.fromJsonLd).find((x) => x.start);
        if (detail) ev = { ...ev, ...Object.fromEntries(Object.entries(detail).filter(([, v]) => v)) };
      } catch (e) { /* nos quedamos con los datos del listado */ }
      out.push({ ...ev, url: it.url, tickets: it.url });
      await u.sleep(300);
    }
    return out;
  },
};
