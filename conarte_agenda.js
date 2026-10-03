// CONARTE: la agenda se consulta día por día con ?fecha=AAAAMMDD.
function parseList(html, date, u, fallbackCategory) {
  const area = html.split('id="result_area"')[1] || '';
  const items = area.match(/<li>\s*<a class="max_wrap"[\s\S]*?<\/li>/g) || [];
  return items.map((li) => {
    const url = (li.match(/href="([^"]+)"/) || [])[1];
    const hours = u.clean((li.match(/schedule_hours">([\s\S]*?)<\/p>/) || [])[1] || '');
    const times = [...hours.matchAll(/(\d{1,2}:\d{2})/g)].map((m) => m[1].padStart(5, '0'));
    const title = u.clean((li.match(/<h2>([\s\S]*?)<\/h2>/) || [])[1] || '');
    const kicker = u.clean((li.match(/class="kicker">([\s\S]*?)<\/div>/) || [])[1] || '');
    const locStrong = u.clean((li.match(/class="location">\s*<p><strong>([\s\S]*?)<\/strong>/) || [])[1] || '');
    const type = u.clean((li.match(/class="type">([\s\S]*?)<\/p>/) || [])[1] || '');
    const img = (li.match(/<img[^>]*src="([^"]+)"/) || [])[1] || null;
    return { url, times, title, kicker, locStrong, type: type || fallbackCategory, img };
  }).filter((x) => x.url && x.title);
}

module.exports = {
  id: 'conarte_agenda',
  name: 'CONARTE (agenda)',
  home: 'https://conarte.org.mx/agenda/',
  days: 45,
  parseList,
  async run(http, u) {
    const out = [];
    let day = u.todayMty();
    for (let i = 0; i < this.days; i++, day = u.addDays(day, 1)) {
      const html = await http.text(`https://conarte.org.mx/agenda/?fecha=${day.replace(/-/g, '')}`);
      for (const x of parseList(html, day, u, null)) {
        const times = x.times.length ? x.times : [null];
        for (const t of times) {
          out.push({
            title: x.title,
            start: t ? `${day}T${t}` : day,
            end: null,
            venue: x.locStrong || x.kicker,
            city: 'Monterrey',
            category: x.type || 'Cultura',
            price: null,
            url: x.url,
            image: x.img,
          });
        }
      }
      await u.sleep(250);
    }
    // Descripción: una consulta por evento distinto a la API de WordPress (?slug=...).
    const slugs = [...new Set(out.map((e) => (e.url.match(/\/agenda\/([^/]+)\/?$/) || [])[1]).filter(Boolean))];
    const desc = {};
    for (const slug of slugs) {
      try {
        const j = await http.json(`https://conarte.org.mx/wp-json/wp/v2/agenda?slug=${encodeURIComponent(slug)}&_fields=excerpt,content`);
        const item = j && j[0];
        if (item) desc[slug] = u.summary((item.content && item.content.rendered) || (item.excerpt && item.excerpt.rendered) || '');
      } catch (e) { /* sin descripción, no pasa nada */ }
      await u.sleep(150);
    }
    for (const e of out) { const slug = (e.url.match(/\/agenda\/([^/]+)\/?$/) || [])[1]; if (slug && desc[slug]) e.description = desc[slug]; }
    return out;
  },
};
