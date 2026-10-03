// Cineteca de Nuevo León (CONARTE): misma estructura que la agenda, por día.
const { parseList } = require('./conarte_agenda');
module.exports = {
  id: 'cineteca',
  name: 'Cineteca Nuevo León',
  home: 'https://conarte.org.mx/cineteca/',
  days: 10,
  parseList,
  async run(http, u) {
    const out = [];
    let day = u.todayMty();
    for (let i = 0; i < this.days; i++, day = u.addDays(day, 1)) {
      const html = await http.text(`https://conarte.org.mx/cineteca/?fecha=${day.replace(/-/g, '')}`);
      for (const x of this.parseList(html, day, u, 'Cine')) {
        // Una tarjeta por película por día; los horarios van en "horarios".
        out.push({
          title: x.title,
          start: x.times[0] ? `${day}T${x.times[0]}` : day,
          end: null,
          times: x.times,
          venue: x.locStrong || 'Cineteca Nuevo León',
          city: 'Monterrey',
          category: 'Cine',
          price: null,
          url: x.url,
          image: x.img,
          description: x.kicker || null,
        });
      }
      await u.sleep(250);
    }
    // Sinopsis completa desde la API de WordPress (la lista sólo trae las primeras palabras).
    const slugs = [...new Set(out.map((e) => (e.url.match(/\/cineteca\/([^/]+)\/?$/) || [])[1]).filter(Boolean))];
    const desc = {};
    for (const slug of slugs) {
      try {
        const j = await http.json(`https://conarte.org.mx/wp-json/wp/v2/cineteca?slug=${encodeURIComponent(slug)}&_fields=excerpt,content`);
        const item = j && j[0];
        if (item) desc[slug] = u.summary((item.content && item.content.rendered) || (item.excerpt && item.excerpt.rendered) || '');
      } catch (e) { /* se queda con el texto corto */ }
      await u.sleep(150);
    }
    for (const e of out) { const slug = (e.url.match(/\/cineteca\/([^/]+)\/?$/) || [])[1]; if (slug && desc[slug]) e.description = desc[slug]; }
    return out;
  },
};
