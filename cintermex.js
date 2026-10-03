// Cintermex: calendario de ferias y expos.
module.exports = {
  id: 'cintermex',
  name: 'Cintermex',
  home: 'https://www.cintermex.com/calendario',
  async run(http, u) {
    const html = await http.text(this.home);
    const blocks = html.split(/<div class="col-xs-12[^"]*evento[^"]*">/).slice(1);
    const out = [];
    for (const b of blocks) {
      const head = (b.match(/class="encabezadoEvento">([\s\S]*?)<\/div>\s*<\/div>/) || [])[1] || '';
      const title = u.clean((head.match(/<strong>([\s\S]*?)<\/strong>/) || [])[1]);
      const dateTxt = u.clean(head.split('</strong>')[1] || '');
      const desc = u.clean((b.match(/<\/p>\s*<\/div>\s*<div>([\s\S]*?)<\/div>/) || [])[1] || '');
      const link = (b.match(/<a href="(https?:[^"]+)"[^>]*target="_blank"/) || [])[1] || this.home;
      const img = (b.match(/background-image:url\(([^)]+)\)/) || [])[1] || null;
      const d = u.parseDateText(dateTxt);
      if (!title || !d) continue;
      out.push({ title, start: d.start, end: d.end, venue: 'Cintermex', city: 'Monterrey', category: 'Ferias y expos', price: null, url: link, image: img, description: desc.slice(0, 280) || null });
    }
    return out;
  },
};
