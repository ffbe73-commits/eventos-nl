// Vive San Pedro (municipio de San Pedro Garza García): API pública con todo el calendario.
const API = 'https://api-vive.sanpedro.gob.mx/api/evento/search';
const IMG = 'https://minio-spgg-api.sanpedro.gob.mx/spgg-calendario/';

module.exports = {
  id: 'sanpedro_vive',
  name: 'Vive San Pedro',
  home: 'https://vive.sanpedro.gob.mx/',
  async run(http, u) {
    const res = await http.post(API, { activo: true });
    const list = (res && res.data) || [];
    if (!list.length) throw new Error('La API de Vive San Pedro no regresó eventos');
    const today = u.todayMty();
    const out = [];
    for (const e of list) {
      const startDay = (e.fechaInicio || '').slice(0, 10);
      const endDay = (e.fechaFin || '').slice(0, 10) || null;
      if (!startDay || (endDay || startDay) < today) continue;
      const hi = !e.diaCompleto && e.horaInicio ? e.horaInicio.slice(0, 5) : null;
      const hf = !e.diaCompleto && e.horaFin ? e.horaFin.slice(0, 5) : null;
      const img = ((e.imagenes || []).find((i) => i.tipo === 'hero') || (e.imagenes || [])[0] || {}).nombre;
      const loc = e.ubicacion || {};
      out.push({
        title: u.clean(e.nombre),
        start: hi ? `${startDay}T${hi}` : startDay,
        end: endDay && endDay !== startDay ? endDay : hf ? `${startDay}T${hf}` : null,
        venue: u.clean(loc.alias || ''),
        address: loc.direccion || null,
        city: 'San Pedro Garza García',
        category: (e.categorias || []).map((c) => c.nombre).join(' ') || null,
        price: null,
        url: `https://vive.sanpedro.gob.mx/evento/${e.id}`,
        image: img ? IMG + img : null,
        description: e.descripcion ? u.summary(e.descripcion) : null,
      });
    }
    return out;
  },
};
