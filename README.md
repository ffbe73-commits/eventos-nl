# Eventos NL — recolector

Junta los eventos de Monterrey / Nuevo León de varias páginas y los guarda en `data/events.json`.
La app lee ese archivo; no hay que hacer nada a mano.

## Cómo funciona
- GitHub lo corre solo todos los días a las ~6 am (archivo `.github/workflows/actualizar-eventos.yml`).
- Cada fuente vive en `collector/sources/<fuente>.js`. Si una página cambia su diseño, sólo se arregla ese archivo.
- `data/events.json` incluye `sources`: cuántos eventos trajo cada fuente y si falló. La app lo muestra en la pantalla "Fuentes".

## Correrlo a mano
En GitHub: pestaña **Actions → Actualizar eventos → Run workflow**.

## Ticketmaster
Crea una clave gratis en https://developer.ticketmaster.com y guárdala en
**Settings → Secrets and variables → Actions → New repository secret** con el nombre `TM_API_KEY`.
Sin la clave, esa fuente se salta y CTXplorer cubre parte de sus eventos.

## Fuentes (V1)
Cartelera Escénica · Ticketmaster · Conciertos en Monterrey · CONARTE (agenda) · Cineteca NL ·
Nuevo León Travel · Allevents · CTXplorer · MARCO · 3 Museos · Cintermex · Foro Corona · Fever · Prime Tickets
