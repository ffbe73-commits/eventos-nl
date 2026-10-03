// Prime Tickets: cartelera de teatro (Foro 13 y otros).
module.exports = {
  id: 'primetickets',
  name: 'Prime Tickets',
  home: 'https://cartelera.primetickets.mx/',
  async run(http, u) {
    const html = await http.text(this.home);
    // El carrusel trae el año completo; lo usamos para completar la fecha de las tarjetas.
    const years = {};
    for (const m of html.matchAll(/<h3 class="pt-title">([\s\S]*?)<\/h3>[\s\S]*?<p class="pt-meta">([\s\S]*?)<\/p>/g)) years[u.clean(m[1])] = u.clean(m[2]);
    const cards = html.split('<div class="pt-card">').slice(1);
    const out = [];
    for (const c of cards) {
      const title = u.clean((c.match(/<h2 class="pt-title">([\s\S]*?)<\/h2>/) || [])[1]);
      const dateTxt = years[title] || u.clean((c.match(/<span class="pt-date">([\s\S]*?)<\/span>/) || [])[1]);
      const venue = u.clean((c.match(/<span class="pt-venue">([\s\S]*?)<\/span>/) || [])[1] || '');
      const city = u.clean((c.match(/<span class="pt-city">([\s\S]*?)<\/span>/) || [])[1] || '');
      const url = (c.match(/<a href="([^"]+)"/) || [])[1];
      const img = (c.match(/<img[^>]*src="([^"]+)"/) || [])[1];
      const d = u.parseDateText(dateTxt);
      if (!title || !d) continue;
      if (city && !/monterrey|san pedro|nuevo le|apodaca|escobedo|guadalupe|santa catarina|san nicol/i.test(city)) continue;
      out.push({ title, start: d.start, end: d.end, venue, city: city || 'Monterrey', category: 'Teatro', price: null, url, image: img ? new URL(img, this.home).href : null });
    }
    return out;
  },
};
