// SuperBoletos: la página bloquea robots, pero su catálogo completo es un JSON público en su CDN.
const CDN = 'https://dl09mj2qf37fz.cloudfront.net/SuperBoletosRepositorio/apps/jsonCache';
const FALLBACK_VERSION = '27768';
const IMG = 'https://web2.superboletos.com';
const CATS = { Conciertos: 'Música', Teatro: 'Teatro', Deportes: 'Deportes', Familiares: null, Especiales: 'Experiencias', Culturales: 'Exposiciones', Festivales: 'Música' };

// La "versión" del catálogo cambia cuando actualizan el sitio; se intenta leer la vigente y si no, se usa la última conocida.
async function currentVersion(http) {
  try {
    const html = await http.text('https://www.superboletos.com/');
    const app = (html.match(/\/_next\/static\/chunks\/pages\/_app-[a-z0-9]+\.js/) || [])[0];
    if (app) {
      const js = await http.text(`https://www.superboletos.com${app}`);
      const v = (js.match(/NEXT_PUBLIC_CDN_CONTENT_VERSION:"(\d+)"/) || [])[1];
      if (v) return v;
    }
  } catch (e) { /* bloqueado: usamos la versión conocida */ }
  return FALLBACK_VERSION;
}

module.exports = {
  id: 'superboletos',
  name: 'SuperBoletos',
  home: 'https://www.superboletos.com/',
  async run(http, u) {
    const version = await currentVersion(http);
    let list;
    try { list = await http.json(`${CDN}/${version}/catalogos/search.json`); }
    catch (e) { list = await http.json(`${CDN}/${FALLBACK_VERSION}/catalogos/search.json`); }
    const out = [];
    for (const e of list || []) {
      if (!/nuevo le/i.test(`${e.nombreEstado || ''} ${e.estadoEvento || ''}`)) continue;
      if ((e.claveEstatusFechaEvento || '').toUpperCase() !== 'NORMAL') continue;
      // fechaPrimeraPresentacion = "dd/mm/aaaa hh:mm:ss"; la hora "oficial" viene en el texto de fechas.
      const m = (e.fechaPrimeraPresentacion || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
      if (!m) continue;
      const shown = u.parseTime(e.fechas || '');
      const start = `${m[3]}-${m[2]}-${m[1]}T${shown || `${m[4]}:${m[5]}`}`;
      const min = Number(e.precioMinimo), max = Number(e.precioMaximo);
      const price = min > 0 ? (max > min ? `$${min} – $${max}` : `$${min}`) : null;
      const img = e.rutaImagenMain || e.rutaImagenThumb || null;
      const url = `https://www.superboletos.com/landing-evento/${e.eventoId}`;
      out.push({
        title: u.clean(e.nombreEvento),
        start,
        end: null,
        venue: u.clean(e.nombreRecinto || ''),
        city: u.clean(e.nombreCiudad || ''),
        category: e.claveTipoEvento in CATS ? CATS[e.claveTipoEvento] : e.claveTipoEvento || null,
        price,
        url,
        tickets: url,
        image: img ? (/^https?:/.test(img) ? img : `${IMG}${img.startsWith('/') ? '' : '/'}${img}`) : null,
        description: e.fechas && /\d/.test(e.fechas) && e.fechas.length > 40 ? u.clean(e.fechas) : null,
      });
    }
    return out;
  },
};
