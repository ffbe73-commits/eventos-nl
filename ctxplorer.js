// CTXplorer: página de Monterrey (datos de Ticketmaster en JSON-LD). Respaldo mientras no haya clave de Ticketmaster.
module.exports = {
  id: 'ctxplorer',
  name: 'CTXplorer (Monterrey)',
  home: 'https://ctxplorer.com/mx/monterrey',
  async run(http, u) {
    const html = await http.text(this.home);
    return u.jsonLdEvents(html).map(u.fromJsonLd).map((e) => ({ ...e, price: null }));
  },
};
