// Orquesta Sinfónica de la UANL: su sitio publica la temporada sólo como imágenes.
// Las fechas se capturan a mano una vez por serie (osuanl.json) y aquí se vigila si ya publicaron una serie nueva.
const fs = require('fs');
const path = require('path');
const HOME = 'https://orquestasinfonica.uanl.mx/temporadas/';

module.exports = {
  id: 'osuanl',
  name: 'Orquesta Sinfónica UANL',
  home: HOME,
  async run(http, u) {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'osuanl.json'), 'utf8'));
    const out = data.events.map((e) => ({
      title: e.title,
      start: e.start,
      end: null,
      venue: e.venue || data.venue,
      city: 'Monterrey',
      category: 'Música',
      price: null,
      url: e.url || data.url,
      tickets: data.tickets,
      image: e.image || null,
      description: e.description || null,
    }));
    // ¿Publicaron una serie que todavía no tenemos? (p. ej. "temporada-2027-primera-serie")
    try {
      const html = await http.text(HOME);
      const series = [...new Set([...html.matchAll(/orquestasinfonica\.uanl\.mx\/((?:temporada|conciertos?-extraordinarios?)-(20\d\d)[a-z0-9-]*)\//g)]
        .filter((m) => +m[2] >= +u.todayMty().slice(0, 4)).map((m) => m[1]))];
      const nuevas = series.filter((s) => !data.known.includes(s));
      if (nuevas.length) out.warning = `Serie nueva publicada (${nuevas.join(', ')}): pídele a Claude que la capture`;
    } catch (e) { /* si el sitio no responde, seguimos con lo capturado */ }
    return out;
  },
};
