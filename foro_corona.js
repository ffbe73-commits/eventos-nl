// Foro Corona: sitio Wix, tarjetas con data-hook="title" y data-hook="date".
module.exports = {
  id: 'foro_corona',
  name: 'Foro Corona',
  home: 'https://www.forocorona.com/cartelera',
  async run(http, u) {
    const html = await http.text(this.home);
    const cards = html.split('data-hook="events-card"').slice(1);
    const out = [];
    for (const c of cards) {
      const title = u.clean((c.match(/data-hook="title"[^>]*>([\s\S]*?)</) || [])[1]);
      const d = u.parseDateText((c.match(/data-hook="date"[^>]*>([\s\S]*?)</) || [])[1]);
      const link = (c.match(/href="(https:\/\/www\.forocorona\.com\/[^"]*event[^"]*)"/) || [])[1] || this.home;
      if (!title || !d) continue;
      out.push({ title, start: d.time ? `${d.start}T${d.time}` : d.start, end: null, venue: 'Foro Corona', city: 'Monterrey', category: 'Música', price: null, url: link, image: null });
    }
    return out;
  },
};
