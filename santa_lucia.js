// Festival Internacional de Santa Lucía: fuente manual, capturada del PDF oficial de la agenda.
// Para el próximo año sólo se reemplaza santa_lucia.json.
module.exports = {
  id: 'santa_lucia',
  name: 'Festival Santa Lucía (agenda PDF)',
  home: 'https://festivalsantalucia.gob.mx/',
  async run() {
    const data = require('./santa_lucia.json');
    return data.events.map((e) => ({ ...e }));
  },
};
