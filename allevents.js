// Allevents: agregador. Tarjetas <li class="event-card"> en el HTML.
module.exports = {
  id: 'allevents',
  name: 'Allevents Monterrey',
  home: 'https://allevents.in/monterrey/all',
  async run(http, u) {
    const html = await http.text(this.home);
    const cards = html.match(/<li class="event-card[^"]*"[\s\S]*?<\/li>/g) || [];
    const out = [];
    for (const c of cards) {
      const title = u.clean((c.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || (c.match(/data-name="([^"]+)"/) || [])[1]).replace(/\s+(en\s+)?Monterrey\s+Tickets$|\s+Tickets$/i, '');
      const url = (c.match(/data-link="([^"]+)"/) || [])[1];
      const dateTxt = (c.match(/<div class="date"[^>]*>([\s\S]*?)<\/div>/) || [])[1];
      const venue = u.clean((c.match(/<div class="location[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
      const img = (c.match(/data-src="([^"]+)"/) || [])[1] || null;
      const d = u.parseDateText(dateTxt);
      if (!title || !d) continue;
      out.push({ title, start: d.time ? `${d.start}T${d.time}` : d.start, end: d.end, venue, city: 'Monterrey', category: null, price: null, url, image: img });
    }
    return out;
  },
};
