// Conciertos en Monterrey: datos estructurados (JSON-LD). Se lee una página por mes (/cartelera/octubre-2026, ...).
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
module.exports = {
  id: 'conciertos_mty',
  name: 'Conciertos en Monterrey',
  home: 'https://conciertosenmonterrey.com/cartelera',
  months: 8,
  async run(http, u) {
    const seen = new Set();
    const out = [];
    const [y, m] = u.todayMty().split('-').map(Number);
    for (let i = 0; i < this.months; i++) {
      const mi = (m - 1 + i) % 12;
      const yi = y + Math.floor((m - 1 + i) / 12);
      let html;
      try { html = await http.text(`${this.home}/${MESES[mi]}-${yi}`); } catch (e) { if (i === 0) throw e; continue; }
      for (const e of u.jsonLdEvents(html).map(u.fromJsonLd)) {
        const k = (e.url || e.title) + e.start;
        if (seen.has(k)) continue;
        seen.add(k);
        // El JSON-LD trae precio 0 y la liga genérica de Ticketmaster: no sirven, se omiten.
        // Sus títulos vienen como "Karol G en Estadio BBVA": separamos artista y recinto.
        const m = !e.venue && e.title.match(/^(.+?)\s+en\s+((?:el |la )?(?:arena|estadio|auditorio|foro|teatro|escenario|explanada|parque|showcenter|caf[eé]|rinc[oó]n|jard[ií]n|metapatio|venue|plaza|centro|cintermex|fundidora|sala|museo)\b.*)$/i);
        if (m) { e.title = m[1].trim(); e.venue = m[2].trim(); }
        out.push({ ...e, price: null, category: 'Música', genre: e.genre });
      }
      await u.sleep(300);
    }
    return out;
  },
};
