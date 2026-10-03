// Parque Ecológico Chipinque: su app (Flutter) se alimenta de una API pública.
// Eventos únicos traen fecha; los semanales ("Cada domingo") se repiten las próximas 8 semanas.
const API = 'https://chipinque-api-prod.onrender.com/api/v1/events?lang=es';
const MEDIA = 'https://chipinque-api-prod.onrender.com/media/';
const HOME = 'https://www.chipinque.org.mx/inicio/eventos';
const DIAS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const CATS = { taller: 'Talleres y charlas', charla: 'Talleres y charlas', infantil: 'Familiar', recorrido: 'Experiencias', bienestar: 'Deportes' };

module.exports = {
  id: 'chipinque',
  name: 'Chipinque',
  home: HOME,
  async run(http, u) {
    const res = await http.json(API);
    const list = (res && res.events) || [];
    if (!list.length) throw new Error('La API de Chipinque no regresó eventos');
    const today = u.todayMty();
    const out = [];
    for (const e of list) {
      const time = u.parseTime(e.time || '');
      const base = {
        title: u.clean(e.title),
        end: null,
        venue: `Chipinque${e.location ? ` · ${u.clean(e.location)}` : ''}`,
        city: 'San Pedro Garza García',
        category: CATS[e.category] || (e.categoryLabel ? `${e.categoryLabel} ${e.category}` : 'Experiencias'),
        price: e.price && /\$/.test(e.price) ? e.price.replace(/\.00 MXN/, '') : null,
        url: HOME,
        image: e.imageUrl ? MEDIA + e.imageUrl : null,
        description: [e.subtitle, e.description].filter(Boolean).map(u.clean).join('. ').slice(0, 600) || null,
      };
      if (e.date) {
        const d = e.date.slice(0, 10);
        if (d >= today) out.push({ ...base, start: time ? `${d}T${time}` : d });
      } else if (e.frequency === 'semanal') {
        const dia = (e.schedule || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/domingo|lunes|martes|miercoles|jueves|viernes|sabado/);
        if (!dia) continue;
        const [y, m, d] = today.split('-').map(Number);
        const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        let first = u.addDays(today, (DIAS[dia[0]] - wd + 7) % 7);
        for (let k = 0; k < 8; k++) {
          const day = u.addDays(first, k * 7);
          out.push({ ...base, start: time ? `${day}T${time}` : day });
        }
      }
    }
    return out;
  },
};
