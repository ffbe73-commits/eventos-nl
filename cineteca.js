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
    return out;
  },
};
