// 3 Museos (Historia Mexicana, Noreste, Palacio). Una tarjeta puede traer varias fechas.
module.exports = {
  id: 'tres_museos',
  name: '3 Museos',
  home: 'https://www.3museos.com/eventos/',
  async run(http, u) {
    const html = await http.text(this.home);
    const sec = html.split('<section id="events-post">')[1] || '';
    const lis = sec.match(/<li[\s\S]*?<\/li>/g) || [];
    const out = [];
    for (const li of lis) {
      const url = (li.match(/href="([^"]+)"/) || [])[1];
      const title = u.clean((li.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1]);
      const type = u.clean((li.match(/<\/span>([\s\S]*?)<\/div>/) || [])[1] || '');
      const img = (li.match(/<img[^>]*src="([^"]+)"/) || [])[1] || null;
      const desc = (li.match(/<h1>[\s\S]*?<\/h1>([\s\S]*?)<\/div>/) || [])[1] || '';
      const lines = u.clean(desc).split('\n').filter(Boolean);
      for (const line of lines) {
        const d = u.parseDateText(line);
        if (!d) continue;
        out.push({ title, start: d.time ? `${d.start}T${d.time}` : d.start, end: d.end, venue: '3 Museos', city: 'Monterrey', category: type || 'Museos', price: null, url, image: img });
      }
    }
    return out;
  },
};
