// Ballet de Monterrey: la portada lista las obras en cartelera; cada obra trae sus funciones como texto
// ("La Bella Durmiente – Vie 9 Oct 2026 – 8pm", "El Cascanueces – Vie 11 Diciembre 26 – 8pm").
const HOME = 'https://balletdemonterrey.com/';
const FUNC = /(?:lun|mar|mi[eé]|jue|vie|s[aá]b|dom)[a-zéá]*\.?\s+(\d{1,2})\s+([a-záéíóú]{3,10})\.?\s+(\d{2,4})\s*[–-]\s*(\d{1,2}(?::\d{2})?\s*[ap]\.?\s?m\.?)/gi;

module.exports = {
  id: 'ballet_mty',
  name: 'Ballet de Monterrey',
  home: HOME,
  async run(http, u) {
    const home = await http.text(HOME);
    const links = [...new Set([...home.matchAll(/href="(https:\/\/balletdemonterrey\.com\/repertorio\/[a-z0-9-]+\/)"/g)].map((m) => m[1]))];
    const out = [];
    for (const url of links) {
      const html = await http.text(url);
      const text = u.clean(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')).replace(/\s+/g, ' ');
      const title = u.clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '').split(/\s+[–-]\s+/)[0].replace(/\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{4}$/i, '').trim();
      const venue = (text.match(/(Teatro de la Ciudad|Auditorio [A-ZÁÉÍÓÚ][\wáéíóú]+(?: [A-ZÁÉÍÓÚ][\wáéíóú]+)*|Teatro [A-ZÁÉÍÓÚ][\wáéíóú]+(?: [A-ZÁÉÍÓÚ][\wáéíóú]+)*)/) || [])[1] || 'Teatro de la Ciudad';
      const price = (text.match(/Precio:\s*(Desde \$\d[\d,]*\d(?: a \$\d[\d,]*\d)?)/i) || [])[1] || null;
      const sinopsis = (text.match(/Sinopsis\s+(.{40,}?)(?:\s+Share this entry|$)/) || [])[1] || null;
      const image = (html.match(/property="og:image" content="([^"]+)"/) || [])[1] || null;
      const seen = new Set();
      for (const m of text.matchAll(FUNC)) {
        const mon = u.MESES[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];
        if (!mon) continue;
        const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
        const start = `${u.ymd(year, mon, +m[1])}T${u.parseTime(m[4]) || '20:00'}`;
        if (seen.has(start)) continue;
        seen.add(start);
        out.push({ title: `${title} · Ballet de Monterrey`, start, end: null, venue, city: 'Monterrey', category: 'Teatro',
          price: price ? price.replace(/Desde /i, '').replace(' a ', ' – ') : null, url, tickets: url, image,
          description: sinopsis ? u.summary(sinopsis) : null });
      }
      await u.sleep(300);
    }
    return out;
  },
};
