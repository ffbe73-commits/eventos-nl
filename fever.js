// Fever: el estado de la página trae los "planes" (Candlelight, experiencias, etc.).
module.exports = {
  id: 'fever',
  name: 'Fever',
  home: 'https://feverup.com/es/monterrey',
  async run(http, u) {
    const html = await http.text(this.home);
    const m = html.match(/<script id="serverapp-state" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) throw new Error('No se encontró serverapp-state');
    const state = JSON.parse(m[1]);
    const plans = new Map();
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== 'object') return;
      if (o.plan_id && o.name && o.first_active_session_date) { if (!plans.has(o.plan_id)) plans.set(o.plan_id, o); return; }
      for (const k in o) walk(o[k]);
    };
    walk(state);
    return [...plans.values()]
      .filter((p) => !p.location || !p.location.city_code || p.location.city_code === 'MTY')
      .map((p) => ({
        title: u.clean(p.name),
        // Fever marca la hora local de Monterrey con '+00:00', así que se toma tal cual.
        start: u.toLocal(String(p.first_active_session_date).slice(0, 19)),
        end: u.toLocal(String(p.last_active_session_date || '').slice(0, 19)),
        venue: (p.location && !p.location.is_hidden && p.location.name) || '',
        city: 'Monterrey',
        category: /candlelight/i.test(p.name) ? 'Música' : 'Experiencias',
        price: p.price_info && !p.price_info.hide && p.price_info.amount ? `Desde $${p.price_info.amount}` : null,
        url: `https://feverup.com/m/${p.plan_id}`,
        image: p.cover_image || null,
      }));
  },
};
