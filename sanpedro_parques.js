// San Pedro + Parques (EventON): se pide al calendario el mes actual y los 2 siguientes.
// Nota: varios registros del sitio no tienen fecha cargada (el propio sitio no los muestra); esos se omiten.
const fs = require('fs');
const path = require('path');
const HOME = 'https://sanpedroparques.mx/calendario-eventos/';
// Las actividades especiales del mes vienen en un PDF; se capturan a mano (sanpedro_parques_pdf.json).

module.exports = {
  id: 'sanpedro_parques',
  name: 'San Pedro + Parques',
  home: HOME,
  months: 3,
  async run(http, u) {
    const page = await http.text(HOME);
    let pdf = { events: [] };
    try { pdf = JSON.parse(fs.readFileSync(path.join(__dirname, 'sanpedro_parques_pdf.json'), 'utf8')); } catch (e) { /* sin captura */ }
    const nn = page.match(/"n":"([a-f0-9]+)","nonce":"([a-f0-9]+)"/);
    if (!nn) throw new Error('No encontré la llave del calendario (¿cambió la página?)');
    const [y, m] = u.todayMty().split('-').map(Number);
    const out = [];
    const seen = new Set();
    for (let i = 0; i < this.months; i++) {
      const mi = ((m - 1 + i) % 12) + 1;
      const yi = y + Math.floor((m - 1 + i) / 12);
      const from = Date.UTC(yi, mi - 1, 1) / 1000, to = Date.UTC(yi, mi, 1) / 1000 - 1;
      const sc = { calendar_type: 'default', event_count: '0', show_limit: 'no', number_of_months: '1', fixed_day: '1', fixed_month: String(mi), fixed_year: String(yi),
        hide_past: 'yes', hide_past_by: 'ee', event_past_future: 'future', event_order: 'ASC', sort_by: 'sort_date', lang: 'L1', event_type: 'all', event_location: 'all',
        show_repeats: 'no', tiles: 'no', focus_start_date_range: String(from), focus_end_date_range: String(to) };
      const form = { direction: 'none', ajaxtype: 'switchmonth', nonce: nn[1], nonceX: nn[2] };
      for (const [k, v] of Object.entries(sc)) form[`shortcode[${k}]`] = v;
      const res = await http.form('https://sanpedroparques.mx/?evo-ajax=eventon_get_events', form);
      const urls = {};
      for (const x of (res.html || '').matchAll(/data-event_id="(\d+)"[\s\S]{0,600}?itemprop='url'\s+href='([^']+)'/g)) urls[x[1]] = x[2];
      for (const e of res.json || []) {
        if (!(e.unix_start > 0)) continue; // sin fecha cargada
        const key = `${e.ID}|${e.unix_start}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const pmv = e.event_pmv || {};
        const allDay = (pmv.evcal_allday || [])[0] === 'yes';
        // EventON guarda la hora local como si fuera UTC ("GMT+00:00").
        const iso = (s) => new Date(s * 1000).toISOString().slice(0, 16);
        out.push({
          title: u.clean(e.event_title),
          start: allDay ? iso(e.unix_start).slice(0, 10) : iso(e.unix_start),
          end: e.unix_end > e.unix_start ? (allDay ? iso(e.unix_end).slice(0, 10) : iso(e.unix_end)) : null,
          venue: u.clean((pmv.evcal_location_name || [])[0] || ''),
          city: 'San Pedro Garza García',
          category: null,
          price: /cobro/i.test(e.event_title) ? 'Con costo' : null,
          url: urls[e.ID] || HOME,
          image: null,
          description: null,
        });
      }
      await u.sleep(500);
    }
    for (const e of pdf.events || []) {
      out.push({ ...e, end: e.end || null, city: 'San Pedro Garza García', price: null, url: pdf.pdf || HOME, image: null, description: e.description || null });
    }
    // ¿Ya publicaron el PDF de otro mes?
    const link = (page.match(/href="(https:\/\/sanpedroparques\.mx\/wp-content\/uploads\/[^"]+\.pdf)"/i) || [])[1];
    if (link && pdf.pdf && link !== pdf.pdf) out.warning = 'Ya publicaron el PDF de un mes nuevo: pídele a Claude que lo capture';
    return out;
  },
};
