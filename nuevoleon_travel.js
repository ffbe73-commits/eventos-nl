// Turismo Nuevo León: agenda estatal (WordPress). Ordenada por publicación, así que se leen varias páginas.
module.exports = {
  id: 'nuevoleon_travel',
  name: 'Nuevo León Travel',
  home: 'https://www.nuevoleon.travel/eventos/',
  pages: 1, // la paginación del sitio repite la página 1
  async run(http, u) {
    const out = [];
    const today = u.todayMty();
    for (let p = 1; p <= this.pages; p++) {
      const url = p === 1 ? this.home : `${this.home}page/${p}/`;
      let html;
      try { html = await http.text(url); } catch (e) { if (p === 1) throw e; break; }
      const items = html.match(/<div class="common-single-item">[\s\S]*?<!-- Ends Common Single Item -->/g) || [];
      if (!items.length) break;
      for (const it of items) {
        const title = u.clean((it.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1]);
        const d = u.parseDateText((it.match(/<h4>([\s\S]*?)<\/h4>/) || [])[1]);
        const link = (it.match(/<a href="([^"]+)"/) || [])[1];
        const img = (it.match(/background-image:\s*url\(([^)]+)\)/) || [])[1] || null;
        if (!title || !d) continue;
        out.push({ title, start: d.start, end: d.end, venue: '', city: '', category: null, price: null, url: link, image: img });
      }
      // Si toda la página ya es pasado, no tiene caso seguir.
      if (out.length && items.every((it) => { const d = u.parseDateText((it.match(/<h4>([\s\S]*?)<\/h4>/) || [])[1]); return d && d.start < today; })) break;
      await u.sleep(300);
    }
    return out;
  },
};
