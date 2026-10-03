// MARCO: lista de eventos en HTML, tarjetas <a> con fecha y hora.
module.exports = {
  id: 'marco',
  name: 'MARCO',
  home: 'https://www.marco.org.mx/eventos/',
  async run(http, u) {
    const html = await http.text(this.home);
    const area = html.split('id="eventos-container"')[1] || html;
    const cards = area.match(/<a href="https:\/\/www\.marco\.org\.mx\/eventos\/[\s\S]*?<\/a>/g) || [];
    const out = [];
    const seen = new Set();
    for (const c of cards) {
      const url = (c.match(/href="([^"]+)"/) || [])[1];
      const title = u.clean((c.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1]);
      const spans = [...c.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => u.clean(m[1]));
      const d = u.parseDateText(spans.join(' '));
      const time = u.parseTime(spans[1] || '') || (spans[1] && (spans[1].match(/(\d{1,2}:\d{2})/) || [])[1]);
      const price = u.clean((c.match(/<p[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '');
      const img = (c.match(/<img[^>]*src="([^"]+)"/) || [])[1] || null;
      if (!title || !d) continue;
      const start = time ? `${d.start}T${time.padStart(5, '0')}` : d.start;
      if (seen.has(url + start)) continue;
      seen.add(url + start);
      out.push({ title, start, end: d.end, venue: 'MARCO', city: 'Monterrey', category: 'Museos', price: price || null, url, image: img });
    }
    return out;
  },
};
