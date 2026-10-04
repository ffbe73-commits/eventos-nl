// Eventos NL — V2.3 (vista grande/compacta, deslizar para decidir, cartelera arriba)
// Lee los eventos que junta el recolector de GitHub y te deja agendarlos, marcarlos y guardar a cuáles fuiste.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, SectionList, TouchableOpacity, Image, Modal, ScrollView,
  TextInput, Alert, Linking, RefreshControl, ActivityIndicator, StatusBar, Platform, Share, Vibration,
  Animated, PanResponder, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar'; // SDK 55 (Snack). En SDK 57 cambia a 'expo-calendar/legacy'
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

// ---------------- Configuración ----------------
const DATA_URL = 'https://raw.githubusercontent.com/ffbe73-commits/eventos-nl/main/events.json';
const LONG_RANGE_DAYS = 7; // eventos que duran más que esto van a "En cartelera"

const C = {
  bg: '#160c33', card: 'rgba(255,255,255,0.08)', card2: 'rgba(255,255,255,0.14)', line: 'rgba(255,255,255,0.14)',
  text: '#ffffff', sub: '#c3bce3', accent: '#ff6b4a', pink: '#ff3d8b', ok: '#3ee6a0', danger: '#ff6b81', star: '#ffd43b',
  solid: '#1d1142', // fondo sólido para encabezados fijos y menús
};
// Degradados: noche de festival (morado → magenta → azul) y acento atardecer (naranja → rosa).
const BG = ['#1a1035', '#120c27', '#0e0c22']; // fondo oscuro casi plano: las fotos son las protagonistas
const ACC = ['#ff8a3d', '#ff3d8b'];
const LG = (() => { try { return require('expo-linear-gradient').LinearGradient; } catch (e) { return null; } })();
function Grad({ colors, style, children, start = { x: 0, y: 0 }, end = { x: 1, y: 1 } }) {
  if (LG) return <LG colors={colors} start={start} end={end} style={style}>{children}</LG>;
  return <View style={[style, { backgroundColor: colors[Math.floor(colors.length / 2)] }]}>{children}</View>;
}
// Zonas seguras: la app se acomoda arriba del reloj y ARRIBA de los botones de Android (nunca tapada).
const SAC = (() => { try { return require('react-native-safe-area-context'); } catch (e) { return null; } })();
const SafeProvider = SAC && SAC.SafeAreaProvider ? SAC.SafeAreaProvider : ({ children }) => children;
const FALLBACK_INSETS = { top: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0, bottom: Platform.OS === 'android' ? 48 : 0, left: 0, right: 0 };
function useInsets() { return SAC && SAC.useSafeAreaInsets ? SAC.useSafeAreaInsets() : FALLBACK_INSETS; }
function SafeBox({ children, style, bottom = true }) {
  const ins = useInsets();
  return <View style={[{ flex: 1, paddingTop: ins.top, paddingBottom: bottom ? ins.bottom : 0 }, style]}>{children}</View>;
}
const vibrar = () => { try { Vibration.vibrate(12); } catch (e) { /* sin vibración */ } };
const Screen = ({ children }) => (
  <Grad colors={BG} start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 1 }} style={{ flex: 1 }}>{children}</Grad>
);
const CAT = {
  'Música': { c: '#b18cff', i: 'musical-notes' },
  'Teatro': { c: '#ff5fa2', i: 'film-outline' },
  'Cine': { c: '#4fb3ff', i: 'videocam' },
  'Exposiciones': { c: '#2ee6a8', i: 'color-palette' },
  'Museos': { c: '#22d3ee', i: 'business' },
  'Ferias y expos': { c: '#ffc93d', i: 'storefront' },
  'Talleres y charlas': { c: '#ffa94d', i: 'chatbubbles' },
  'Familiar': { c: '#ff8a5c', i: 'happy' },
  'Experiencias': { c: '#f472ff', i: 'sparkles' },
  'Deportes': { c: '#7cf27c', i: 'football' },
  'Otros': { c: '#a5b4d4', i: 'ellipse' },
};
const catInfo = (c) => CAT[c] || CAT['Otros'];

// ---------------- Fechas ----------------
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (s) => (s || '').slice(0, 10);
const hasTime = (s) => !!s && s.length > 10;
const parseLocal = (s) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  const [hh, mm] = hasTime(s) ? s.slice(11, 16).split(':').map(Number) : [0, 0];
  return new Date(y, m - 1, d, hh, mm);
};
const addDays = (s, n) => { const d = parseLocal(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parseLocal(day(b)) - parseLocal(day(a))) / 864e5);
const fmtTime = (s) => {
  if (!hasTime(s)) return '';
  let [h, m] = s.slice(11, 16).split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${ap}`;
};
const fmtDayLong = (s) => { const d = parseLocal(s); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const fmtDayShort = (s) => { const d = parseLocal(s); return `${DIAS_C[d.getDay()]} ${d.getDate()} ${MESES_C[d.getMonth()]}`; };
const todayStr = () => ymd(new Date());
function relativeLabel(s) {
  const t = todayStr();
  if (s === t) return 'Hoy';
  if (s === addDays(t, 1)) return 'Mañana';
  return fmtDayLong(s);
}
function weekendRange() {
  const t = todayStr();
  const dow = parseLocal(t).getDay(); // 0 dom
  if (dow === 0) return [t, t];
  if (dow === 6) return [t, addDays(t, 1)];
  const toFri = 5 - dow;
  return [addDays(t, Math.max(0, toFri)), addDays(t, Math.max(0, toFri) + 2)];
}

// ---------------- Modelo de eventos ----------------
// Cada evento puede tener: start/end (rango) o dates[] (varias funciones).
function occurrences(e) {
  if (e.dates && e.dates.length) return e.dates.map((d) => ({ start: d.start, end: d.end || null, url: d.url, avail: d.avail, left: d.left, price: d.price }));
  return [{ start: e.start, end: e.end || null, url: e.url }];
}
// Un concierto que "termina" a la 1 am del día siguiente no es un evento de varios días.
const endsNextMorning = (e) => hasTime(e.end) && daysBetween(e.start, e.end) === 1 && Number(e.end.slice(11, 13)) < 8;
// También cuenta como "en cartelera" una exposición que se repite diario a la misma hora (ej. Bienal: 28 "funciones").
const isDailyExhibit = (e) => e.dates && e.dates.length >= 10 && daysBetween(e.dates[0].start, e.dates[e.dates.length - 1].start) > LONG_RANGE_DAYS
  && new Set(e.dates.map((d) => d.start.slice(11, 16))).size === 1;
const isLongRange = (e) => (!(e.dates && e.dates.length) && e.end && daysBetween(e.start, e.end) > LONG_RANGE_DAYS) || isDailyExhibit(e);
const isShortRange = (e) => !(e.dates && e.dates.length) && !isLongRange(e) && e.end && daysBetween(e.start, e.end) >= 1 && !isLongRange(e) && !endsNextMorning(e);
function nextOccurrence(e, from) {
  const occ = occurrences(e);
  if (isShortRange(e) && day(e.start) <= from && day(e.end) >= from) return { ...occ[0], start: from };
  return occ.find((o) => day(o.start) >= from) || null;
}
function occursBetween(e, a, b) {
  if (isShortRange(e)) return day(e.start) <= b && day(e.end) >= a;
  return occurrences(e).some((o) => day(o.start) >= a && day(o.start) <= b);
}

// ---------------- Boletos ----------------
const VENDORS = [
  [/ticketmaster\./, 'Ticketmaster'], [/arema\.mx/, 'Arema'], [/superboletos\./, 'SuperBoletos'], [/feverup\.com/, 'Fever'],
  [/primetickets\.mx/, 'Prime Tickets'], [/eventbrite\./, 'Eventbrite'], [/boletia\./, 'Boletia'], [/eticket\./, 'eTicket'],
  [/newticket\./, 'NewTicket'], [/boletomovil\./, 'BoletoMóvil'], [/janto4?\./, 'Taquilla en línea'], [/funticket|passline|boletopolis/, 'Boletera'],
];
const SOURCE_NAMES = {
  cartelera_escenica: 'Cartelera Escénica', conciertos_mty: 'Conciertos en Monterrey', conarte_agenda: 'CONARTE', cineteca: 'Cineteca NL',
  santa_lucia: 'Festival Santa Lucía', nuevoleon_travel: 'Nuevo León Travel', allevents: 'Allevents', ctxplorer: 'CTXplorer', marco: 'MARCO',
  tres_museos: '3 Museos', arema: 'Arema', superboletos: 'SuperBoletos', cintermex: 'Cintermex', foro_corona: 'Foro Corona', fever: 'Fever', primetickets: 'Prime Tickets', ticketmaster: 'Ticketmaster', osuanl: 'OSUANL', ballet_mty: 'Ballet de Monterrey',
  sanpedro_vive: 'Vive San Pedro', sanpedro_parques: 'San Pedro + Parques', chipinque: 'Chipinque', eventbrite: 'Eventbrite', manual: 'Manual',
};
const vendorOf = (url) => { const v = VENDORS.find(([re]) => re.test(url || '')); return v ? v[1] : null; };
const isGenericHome = (url) => /^https?:\/\/[^/]+\/?$/.test(url || '');
const isFree = (ev) => /libre|gratis|gratuit|sin costo/i.test(ev.price || '');
// Devuelve el mejor link para comprar: directo del evento si existe; si sólo hay la página principal de la boletera, busca el evento ahí.
function ticketLink(ev) {
  const cands = [ev.tickets, ...(ev.sources || []).map((x) => x.url), ev.url].filter(Boolean);
  for (const u of cands) {
    const v = vendorOf(u);
    if (v && !isGenericHome(u)) return { url: u, vendor: v, direct: true };
  }
  const ctx = (ev.sources || []).find((x) => x.id === 'ctxplorer' && x.url);
  if (ctx) return { url: ctx.url, vendor: 'Ticketmaster (vía CTXplorer)', direct: true };
  if (isFree(ev)) return null;
  if (['Música', 'Teatro', 'Deportes'].includes(ev.category)) {
    return { url: `https://www.ticketmaster.com.mx/search?q=${encodeURIComponent(ev.title)}`, vendor: 'Ticketmaster', direct: false };
  }
  return null;
}

// ---------------- Ocultar ----------------
// Se oculta por NOMBRE (no por fecha), así las funciones futuras del mismo evento tampoco aparecen.
const normKey = (x) => (x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\b(en|de|la|el|los|las|monterrey|mty|2026|2027)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const titleKey = (e) => `t:${normKey(e.title)}`;
const venueKey = (e) => `v:${normKey((e.venue || '').split(/[|,]/)[0])}`;
const isHiddenEv = (hidden, e) => !!(hidden[e.id] || hidden[titleKey(e)] || (e.venue && hidden[venueKey(e)]));

// ---------------- Almacenamiento ----------------
const K = { cache: 'enl_cache', favs: 'enl_favs', hidden: 'enl_hidden', agendados: 'enl_agendados', checkins: 'enl_checkins', manual: 'enl_manual' };
const load = async (k, d) => { try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => AsyncStorage.setItem(k, JSON.stringify(v)).catch(() => {});

// ---------------- Calendario ----------------
function googleCalUrl(ev, occ) {
  const s = parseLocal(occ.start);
  const e = occ.end && hasTime(occ.end) && day(occ.end) === day(occ.start) ? parseLocal(occ.end) : new Date(s.getTime() + 2 * 3600e3);
  const f = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const dates = hasTime(occ.start) ? `${f(s)}/${f(e)}` : `${occ.start.replace(/-/g, '')}/${addDays(occ.start, 1).replace(/-/g, '')}`;
  const q = (x) => encodeURIComponent(x || '');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${q(ev.title)}&dates=${dates}&ctz=America/Monterrey&location=${q([ev.venue, ev.city].filter(Boolean).join(', '))}&details=${q(occ.url || ev.url)}`;
}
async function addToCalendar(ev, occ) {
  const start = parseLocal(occ.start);
  const allDay = !hasTime(occ.start);
  const end = occ.end && hasTime(occ.end) && day(occ.end) === day(occ.start)
    ? parseLocal(occ.end)
    : allDay ? parseLocal(addDays(occ.start, 1)) : new Date(start.getTime() + 2 * 3600e3);
  try {
    await Calendar.createEventInCalendarAsync({
      title: ev.title, startDate: start, endDate: end, allDay,
      location: [ev.venue, ev.city].filter(Boolean).join(', '),
      notes: [ev.price ? `Precio: ${ev.price}` : '', occ.url || ev.url || ''].filter(Boolean).join('\n'),
    });
    return true;
  } catch (err) {
    await Linking.openURL(googleCalUrl(ev, occ));
    return true;
  }
}

// ---------------- Archivos ----------------
// expo-file-system se carga sólo cuando se usa: así la app abre aunque el entorno (Snack web) no lo tenga.
function getFS() {
  try { const fs = require('expo-file-system'); return fs && fs.File && fs.Paths ? fs : null; } catch (e) { return null; }
}

// ---------------- Fotos ----------------
async function pickPhotos() {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.7, selectionLimit: 10 });
  if (res.canceled) return [];
  const out = [];
  const fs = getFS();
  for (const a of res.assets) {
    try {
      if (!fs) throw new Error('sin file-system');
      const { File, Directory, Paths } = fs;
      const dir = new Directory(Paths.document, 'fotos');
      if (!dir.exists) dir.create();
      const dest = new File(dir, `${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`);
      await new File(a.uri).copy(dest);
      out.push(dest.uri);
    } catch (e) {
      out.push(a.uri); // si no se pudo copiar, se guarda la referencia original
    }
  }
  return out;
}

// =====================================================================
export default function App() {
  return <SafeProvider><AppInner /></SafeProvider>;
}

function AppInner() {
  const ins = useInsets();
  const [tab, setTab] = useState('explorar');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [favs, setFavs] = useState({});
  const [hidden, setHidden] = useState({});
  const [agendados, setAgendados] = useState({});
  const [checkins, setCheckins] = useState([]);
  const [manual, setManual] = useState([]);
  const [detail, setDetail] = useState(null);
  const [checkinOpen, setCheckinOpen] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(null); // para "Nuevos desde tu última visita"

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`${DATA_URL}?t=${Date.now()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j);
      save(K.cache, j);
    } catch (e) {
      setError('No se pudo actualizar. Mostrando la última lista guardada.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const [cache, f, h, a, c, m, ls] = await Promise.all([load(K.cache, null), load(K.favs, {}), load(K.hidden, {}), load(K.agendados, {}), load(K.checkins, []), load(K.manual, []), load('enl_lastseen', null)]);
      // Lo "nuevo" se mide contra la última vez que abriste la app (la primera vez: los últimos 3 días).
      setLastSeen(ls || new Date(Date.now() - 3 * 864e5).toISOString());
      save('enl_lastseen', new Date().toISOString());
      if (cache) { setData(cache); setLoading(false); }
      setFavs(f); setHidden(h); setAgendados(a); setCheckins(c); setManual(m);
      fetchData();
    })();
  }, [fetchData]);

  const allEvents = useMemo(() => {
    const evs = (data && data.events) || [];
    return [...manual.map((m) => ({ ...m, manual: true, sources: [{ id: 'manual' }] })), ...evs];
  }, [data, manual]);
  const byId = useMemo(() => Object.fromEntries(allEvents.map((e) => [e.id, e])), [allEvents]);

  const toggle = (setter, key, id, value) => setter((prev) => {
    const n = { ...prev };
    if (n[id]) delete n[id]; else n[id] = value || true;
    save(key, n);
    return n;
  });
  const toggleFav = (e) => toggle(setFavs, K.favs, e.id, { title: e.title, at: todayStr() });
  const toggleHidden = (e) => {
    if (isHiddenEv(hidden, e)) { // mostrar de nuevo: quita cualquier regla que lo esconda
      setHidden((p) => { const n = { ...p }; delete n[e.id]; delete n[titleKey(e)]; if (e.venue) delete n[venueKey(e)]; save(K.hidden, n); return n; });
    } else {
      setHidden((p) => { const n = { ...p, [titleKey(e)]: { title: e.title, kind: 'evento', at: todayStr() } }; save(K.hidden, n); return n; });
    }
  };
  const hideVenue = (e) => setHidden((p) => {
    const n = { ...p, [venueKey(e)]: { title: (e.venue || '').split(/[|,]/)[0].trim(), kind: 'lugar', at: todayStr() } };
    save(K.hidden, n); return n;
  });
  const askHide = (e) => Alert.alert('No me interesa', e.title, [
    { text: 'Ocultar este evento', onPress: () => toggleHidden(e) },
    ...(e.venue ? [{ text: `Ocultar todo en ${(e.venue || '').split(/[|,]/)[0].trim().slice(0, 30)}`, onPress: () => hideVenue(e) }] : []),
    { text: 'Cancelar', style: 'cancel' },
  ]);
  const onCalendar = async (e, occ) => {
    await addToCalendar(e, occ);
    setAgendados((p) => { const n = { ...p, [e.id]: true }; save(K.agendados, n); return n; });
    if (!favs[e.id]) toggleFav(e);
  };
  const saveCheckins = (list) => { setCheckins(list); save(K.checkins, list); };
  const doCheckin = (e, occStart) => {
    const exists = checkins.find((c) => c.eventId === e.id && day(c.date) === day(occStart));
    if (exists) { setCheckinOpen(exists.id); return; }
    const c = { id: `c${Date.now()}`, eventId: e.id, title: e.title, date: occStart, venue: e.venue || '', city: e.city || '', category: e.category || 'Otros', image: e.image || null, photos: [], note: '', createdAt: new Date().toISOString() };
    saveCheckins([c, ...checkins]);
    setDetail(null);
    setCheckinOpen(c.id);
  };
  const saveManual = (m) => { const list = [m, ...manual]; setManual(list); save(K.manual, list); };
  const deleteManual = (id) => { const list = manual.filter((m) => m.id !== id); setManual(list); save(K.manual, list); setDetail(null); };

  const unhide = (key) => setHidden((p) => { const n = { ...p }; delete n[key]; save(K.hidden, n); return n; });
  // Aviso flotante con "Deshacer" por si deslizaste sin querer.
  const [toast, setToast] = useState(null);
  const toastTimer = React.useRef(null);
  const notify = (msg, undo) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, undo });
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  };
  const hideNow = (e) => {
    if (isHiddenEv(hidden, e)) return;
    const key = titleKey(e);
    setHidden((p) => { const n = { ...p, [key]: { title: e.title, kind: 'evento', at: todayStr() } }; save(K.hidden, n); return n; });
    notify(`Oculto: ${e.title}`, () => unhide(key));
  };
  const likeNow = (e) => {
    if (favs[e.id]) { notify('Ya estaba en Me interesa ⭐'); return; }
    toggleFav(e);
    notify('⭐ Guardado en Me interesa', () => setFavs((p) => { const n = { ...p }; delete n[e.id]; save(K.favs, n); return n; }));
  };
  const ctx = { allEvents, byId, favs, hidden, agendados, checkins, toggleFav, toggleHidden, askHide, onCalendar, open: setDetail, unhide, hideNow, likeNow };

  return (
    <Screen><View style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, paddingTop: ins.top }}>
        {loading && !data ? (
          <View style={s.center}><ActivityIndicator color={C.accent} size="large" /><Text style={s.sub}>Cargando eventos…</Text></View>
        ) : tab === 'explorar' ? (
          <Explorar {...ctx} data={data} error={error} onRefresh={fetchData} lastSeen={lastSeen} />
        ) : tab === 'mis' ? (
          <MisEventos {...ctx} onOpenCheckin={setCheckinOpen} onAddManual={() => setManualOpen(true)} />
        ) : (
          <Ajustes data={data} hidden={hidden} toggleHiddenId={(id) => toggle(setHidden, K.hidden, id)} onRefresh={fetchData}
            backup={{ favs, hidden, agendados, checkins, manual }}
            onRestore={(b) => {
              setFavs(b.favs || {}); save(K.favs, b.favs || {});
              setHidden(b.hidden || {}); save(K.hidden, b.hidden || {});
              setAgendados(b.agendados || {}); save(K.agendados, b.agendados || {});
              saveCheckins(b.checkins || []);
              setManual(b.manual || []); save(K.manual, b.manual || []);
            }} />
        )}
        {toast ? (
          <View style={s.toast}>
            <Text style={s.toastTxt} numberOfLines={2}>{toast.msg}</Text>
            {toast.undo ? <TouchableOpacity onPress={() => { toast.undo(); setToast(null); }} hitSlop={10}><Text style={s.toastUndo}>Deshacer</Text></TouchableOpacity> : null}
          </View>
        ) : null}
      </View>

      <View style={[s.tabbar, { paddingBottom: Math.max(ins.bottom, 6) }]}>
        {[['explorar', 'compass', 'Explorar'], ['mis', 'heart', 'Mis eventos'], ['ajustes', 'settings', 'Fuentes']].map(([k, ic, label]) => (
          <TouchableOpacity key={k} style={s.tabBtn} onPress={() => setTab(k)}>
            <Ionicons name={tab === k ? ic : `${ic}-outline`} size={22} color={tab === k ? C.accent : C.sub} />
            <Text style={[s.tabTxt, tab === k && { color: C.accent }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <DetailModal ev={detail} onClose={() => setDetail(null)} {...ctx} onCheckin={doCheckin} onDeleteManual={deleteManual} />
      <CheckinModal checkin={checkins.find((c) => c.id === checkinOpen)} onClose={() => setCheckinOpen(null)}
        onSave={(c) => saveCheckins(checkins.map((x) => (x.id === c.id ? c : x)))}
        onDelete={(id) => { saveCheckins(checkins.filter((x) => x.id !== id)); setCheckinOpen(null); }} />
      <ManualModal visible={manualOpen} onClose={() => setManualOpen(false)} onSave={(m) => { saveManual(m); setManualOpen(false); }} />
    </View></Screen>
  );
}

// =====================================================================
// EXPLORAR
// Rango de fechas: atajos de un toque + calendario de hasta 3 meses.
const PRESETS = [
  ['hoy', 'Hoy', (t) => [t, t]],
  ['finde', 'Este finde', () => weekendRange()],
  ['semana', '7 días', (t) => [t, addDays(t, 6)]],
  ['mes', '1 mes', (t) => [t, addDays(t, 30)]],
  ['2meses', '2 meses', (t) => [t, addDays(t, 60)]],
  ['3meses', '3 meses', (t) => [t, addDays(t, 91)]],
];

function Explorar({ allEvents, favs, hidden, agendados, toggleFav, askHide, open, data, error, onRefresh, hideNow, likeNow, lastSeen }) {
  const t = todayStr();
  const [range, setRange] = useState(() => [t, addDays(t, 60)]);
  const [preset, setPreset] = useState('2meses');
  const [drawer, setDrawer] = useState(false);
  const [compact, setCompact] = useState(false); // vista grande (≈3 por pantalla) o compacta (≈5)
  const [hint, setHint] = useState(false);
  useEffect(() => {
    load('enl_view', 'grande').then((v) => setCompact(v === 'compacta'));
    load('enl_hint_swipe', false).then((v) => setHint(!v));
  }, []);
  const toggleView = () => setCompact((c) => { save('enl_view', c ? 'grande' : 'compacta'); return !c; });
  const closeHint = () => { setHint(false); save('enl_hint_swipe', true); };
  const [off, setOff] = useState({}); // categorías apagadas (por defecto: todas prendidas)
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [a, b] = range;

  const catsPresent = useMemo(() => Object.keys(CAT).filter((c) => allEvents.some((e) => e.category === c)), [allEvents]);
  const nOn = catsPresent.filter((c) => !off[c]).length;

  const qd = React.useDeferredValue(q); // escribir no se traba: la lista se filtra cuando hay tiempo
  const visibles = useMemo(() => allEvents.filter((e) => !isHiddenEv(hidden, e) && !off[e.category]
    && (!qd || `${e.title} ${e.venue || ''}`.toLowerCase().includes(qd.toLowerCase()))), [allEvents, hidden, off, qd]);

  const perDay = useMemo(() => {
    const m = {};
    const end = addDays(t, 95);
    for (const e of visibles) {
      if (isLongRange(e)) continue;
      if (isShortRange(e)) { for (let d = day(e.start) < t ? t : day(e.start); d <= day(e.end) && d <= end; d = addDays(d, 1)) m[d] = (m[d] || 0) + 1; continue; }
      const seen = {};
      for (const o of occurrences(e)) { const d = day(o.start); if (d >= t && d <= end && !seen[d]) { seen[d] = 1; m[d] = (m[d] || 0) + 1; } }
    }
    return m;
  }, [visibles, t]);

  const sections = useMemo(() => {
    const short = daysBetween(a, b) <= 7;
    const groups = {};
    for (const e of visibles) {
      if (isLongRange(e) || !occursBetween(e, a, b)) continue;
      const first = a < t ? t : a;
      const days = short ? listDays(first, b).filter((d) => occursBetween(e, d, d)) : [day((nextOccurrence(e, first) || {}).start)];
      for (const d of days) {
        if (!d || d > b) continue;
        const occ = isShortRange(e) ? { start: d, end: e.end } : occurrences(e).find((o) => day(o.start) === d);
        (groups[d] = groups[d] || []).push({ e, occ: occ || { start: d } });
      }
    }
    return Object.keys(groups).sort().map((d) => ({
      title: relativeLabel(d),
      data: groups[d].sort((x, y) => (hasTime(x.occ.start) ? x.occ.start : `${d}T99`) < (hasTime(y.occ.start) ? y.occ.start : `${d}T99`) ? -1 : 1),
    }));
  }, [visibles, a, b, t]);

  const total = sections.reduce((n, sct) => n + sct.data.length, 0);
  // Acciones estables: así cada tarjeta sólo se vuelve a dibujar si cambia ELLA (no toda la lista).
  const act = React.useRef({});
  act.current = { open, hideNow, likeNow, askHide, toggleFav };
  const renderRow = useCallback(({ item }) => (
    <EventRow item={item} act={act} compact={compact} isNew={!!lastSeen && !!item.e.firstSeen && item.e.firstSeen > lastSeen}
      fav={!!favs[item.e.id]} agendado={!!agendados[item.e.id]} />
  ), [compact, lastSeen, favs, agendados]);
  // "No te lo pierdas": lo que se está vendiendo rápido (sin importar el mes) y lo recién anunciado.
  const isNewEv = (e) => !!lastSeen && !!e.firstSeen && e.firstSeen > lastSeen;
  const hotList = useMemo(() => visibles.filter((e) => isHot(e) && !e.soldOut && day(e.end || e.start) >= t)
    .sort((x, y) => (nextOccurrence(x, t) || x).start < (nextOccurrence(y, t) || y).start ? -1 : 1), [visibles, t]);
  const newList = useMemo(() => visibles.filter((e) => isNewEv(e) && day(e.end || e.start) >= t)
    .sort((x, y) => (x.firstSeen < y.firstSeen ? 1 : -1)), [visibles, t, lastSeen]);
  const occLabel = (e) => { const o = nextOccurrence(e, t); return o ? fmtDayShort(day(o.start)) : `Hasta ${fmtDayShort(e.end)}`; };
  // Exposiciones y temporadas abiertas en el rango: van en una fila aparte arriba, ordenadas por la que cierra primero.
  const carteleraList = useMemo(() => visibles.filter((e) => isLongRange(e) && day(e.start) <= b && day(e.end) >= a && day(e.end) >= t)
    .sort((x, y) => (x.end < y.end ? -1 : 1)), [visibles, a, b, t]);
  const rangeLabel = a === b ? relativeLabel(a) : `${fmtDayShort(a)} → ${fmtDayShort(b)}`;
  const nFiltros = nOn < catsPresent.length ? 1 : 0;
  const header = (
    <View>
      {hint ? (
        <View style={s.hint}>
          <Ionicons name="swap-horizontal" size={18} color={C.accent} />
          <Text style={[s.sub, { flex: 1, marginLeft: 8, fontSize: 12 }]}>Desliza una tarjeta: ← no me interesa · → me interesa. Tócala para ver el detalle.</Text>
          <TouchableOpacity onPress={closeHint} hitSlop={10}><Ionicons name="close" size={18} color={C.sub} /></TouchableOpacity>
        </View>
      ) : null}
      {hotList.length ? (
        <View style={{ marginBottom: 4 }}>
          <Text style={s.rowHead}>🔥 Alta demanda <Text style={s.secCount}>· compra antes de que se agoten</Text></Text>
          <FlatList horizontal data={hotList} keyExtractor={(e) => `h_${e.id}`} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}
            renderItem={({ item }) => <Poster ev={item} onPress={() => open(item)} onLongPress={() => askHide(item)}
              sub={`${item.waitlist ? 'Lista de espera' : recentMoreDates(item) && item.demand !== 'alta' ? 'Agregaron fechas' : item.demandWhy ? 'Alta demanda' : 'Se agota rápido'} · ${occLabel(item)}`} subColor="#ff8a3d" />} />
        </View>
      ) : null}
      {newList.length ? (
        <View style={{ marginBottom: 4 }}>
          <Text style={s.rowHead}>✨ Nuevos desde tu última visita <Text style={s.secCount}>· {newList.length}</Text></Text>
          <FlatList horizontal data={newList} keyExtractor={(e) => `n_${e.id}`} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}
            renderItem={({ item }) => <Poster ev={item} onPress={() => open(item)} onLongPress={() => askHide(item)} sub={occLabel(item)} subColor="#7cc4ff" />} />
        </View>
      ) : null}
      {carteleraList.length ? (
        <View style={{ marginBottom: 4 }}>
          <Text style={s.rowHead}>En cartelera <Text style={s.secCount}>· {carteleraList.length} exposiciones y temporadas</Text></Text>
          <FlatList
            horizontal
            data={carteleraList}
            keyExtractor={(e) => `c_${e.id}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12 }}
            renderItem={({ item }) => <Poster ev={item} onPress={() => open(item)} onLongPress={() => askHide(item)} />}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={[s.header, s.row, { justifyContent: 'space-between' }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.h1}>Eventos NL</Text>
          <Text style={s.sub}>{data ? `${data.total || allEvents.length} eventos · actualizado ${fmtUpdated(data.generatedAt)}` : ''}</Text>
        </View>
        <TouchableOpacity onPress={toggleView} style={s.viewBtn} hitSlop={6} activeOpacity={0.8}>
          <Ionicons name={compact ? 'albums-outline' : 'list'} size={20} color={C.text} />
          <Text style={s.viewTxt}>{compact ? 'Grande' : 'Compacta'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setDrawer(true)} activeOpacity={0.85}>
          <Grad colors={ACC} style={s.filterBtn}>
            <Ionicons name="options" size={20} color="#fff" />
            <Text style={s.filterTxt}>Filtros</Text>
            {nFiltros ? <View style={s.filterBadge}><Text style={s.filterBadgeTxt}>{nFiltros}</Text></View> : null}
          </Grad>
        </TouchableOpacity>
      </View>
      {error ? <Text style={s.warn}>{error}</Text> : null}

      <TouchableOpacity onPress={() => setDrawer(true)} activeOpacity={0.85} style={{ marginHorizontal: 12, marginBottom: 10 }}>
        <Grad colors={['rgba(255,138,61,0.30)', 'rgba(255,61,139,0.22)', 'rgba(124,92,255,0.25)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.rangeBtn}>
          <Ionicons name="calendar" size={20} color="#fff" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.rangeTxt}>{rangeLabel}</Text>
            <Text style={[s.sub, { fontSize: 12 }]}>{nOn === catsPresent.length ? 'Todas las categorías' : `${nOn} de ${catsPresent.length} categorías`}</Text>
          </View>
          <Text style={s.rangeCount}>{total}</Text>
          <Ionicons name="chevron-forward" size={18} color={C.sub} />
        </Grad>
      </TouchableOpacity>

      <View style={s.searchBox}>
        <Ionicons name="search" size={16} color={C.sub} />
        <TextInput value={q} onChangeText={setQ} placeholder="Buscar evento o lugar" placeholderTextColor={C.sub} style={s.searchInput} />
        {q ? <TouchableOpacity onPress={() => setQ('')}><Ionicons name="close-circle" size={18} color={C.sub} /></TouchableOpacity> : null}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(it, i) => `${it.e.id}_${it.occ.start}_${i}`}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => <Text style={s.secHead}>{section.title} <Text style={s.secCount}>· {section.data.length}</Text></Text>}
        ListHeaderComponent={header}
        renderItem={renderRow}
        initialNumToRender={compact ? 10 : 5}
        maxToRenderPerBatch={compact ? 10 : 5}
        updateCellsBatchingPeriod={40}
        windowSize={9}
        // OJO: no usar removeClippedSubviews aquí. En Android, junto con los encabezados fijos de cada día,
        // tumba la app cuando la lista cambia (al aplicar filtros). Fue la causa del cierre en V2.2.
        removeClippedSubviews={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.accent} colors={[C.accent]} onRefresh={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }} />}
        ListEmptyComponent={<View style={s.center}><Ionicons name="calendar-clear-outline" size={40} color={C.sub} /><Text style={s.sub}>{nOn ? 'No hay eventos con estos filtros.' : 'No hay categorías activas. Abre Filtros y elige al menos una.'}</Text></View>}
        ListFooterComponent={total ? <Text style={[s.sub, { textAlign: 'center', padding: 16 }]}>{total} resultados</Text> : null}
        contentContainerStyle={{ paddingBottom: 24 }}
      />

      <FiltersDrawer visible={drawer} onClose={() => setDrawer(false)} today={t}
        range={range} preset={preset} perDay={perDay}
        catsPresent={catsPresent} off={off} total={total + carteleraList.length}
        outside={((data && data.notIncluded) || []).filter((x) => x.status !== 'indirecto')}
        setPreset={(k, r) => { setPreset(k); setRange(r); }}
        setRange={(r) => { setRange(r); setPreset(null); }}
        toggleCat={(c) => setOff((p) => { const n = { ...p }; if (n[c]) delete n[c]; else n[c] = true; return n; })}
        onlyCat={(c) => setOff(Object.fromEntries(catsPresent.filter((x) => x !== c).map((x) => [x, true])))}
        allCats={() => setOff({})}
        noCats={() => setOff(Object.fromEntries(catsPresent.map((x) => [x, true])))}
        reset={() => { setOff({}); setRange([t, addDays(t, 60)]); setPreset('2meses'); }} />
    </View>
  );
}

// Páginas que la app no puede leer: se muestran como links para revisarlas por fuera.
function OutsidePages({ list, compact }) {
  if (!list || !list.length) return null;
  return (
    <View style={compact ? null : s.box}>
      {list.map((x) => (
        <TouchableOpacity key={x.name} style={[s.srcRow, compact && { paddingHorizontal: 0 }]} onPress={() => x.home && Linking.openURL(x.home)} activeOpacity={0.7}>
          <Ionicons name={/facebook\.com/.test(x.home || '') ? 'logo-facebook' : x.status === 'excluido' ? 'film-outline' : 'globe-outline'} size={18} color={C.accent} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.text}>{x.name}</Text>
            <Text style={[s.sub, { fontSize: 12 }]}>{x.reason}</Text>
          </View>
          <View style={[s.row, { marginLeft: 8 }]}>
            <Text style={{ color: C.accent, fontWeight: '700', fontSize: 12, marginRight: 4 }}>Ver</Text>
            <Ionicons name="open-outline" size={16} color={C.accent} />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Menú lateral de filtros: entra deslizándose desde la derecha; se cierra tocando afuera o deslizando a la derecha.
function FiltersDrawer({ visible, onClose, today, range, preset, perDay, catsPresent, off, total, outside,
  setPreset, setRange, toggleCat, onlyCat, allCats, noCats, reset }) {
  const W = Math.min(Dimensions.get('window').width * 0.88, 420);
  const x = React.useRef(new Animated.Value(W)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) { setMounted(true); Animated.timing(x, { toValue: 0, duration: 240, useNativeDriver: true }).start(); }
    else Animated.timing(x, { toValue: W, duration: 200, useNativeDriver: true }).start(() => setMounted(false));
  }, [visible]);
  const pan = React.useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_, g) => { if (g.dx > 0) x.setValue(g.dx); },
    onPanResponderRelease: (_, g) => { if (g.dx > 80) onClose(); else Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(); },
  })).current;
  if (!mounted) return null;
  const allOn = catsPresent.every((c) => !off[c]);
  const noneOn = catsPresent.every((c) => off[c]);
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[s.drawer, { width: W, transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        <Grad colors={['#341270', '#1d1142', '#0f2257']} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={{ flex: 1 }}>
          <SafeBox>
            <View style={[s.row, { justifyContent: 'space-between', padding: 16, paddingBottom: 6 }]}>
              <Text style={s.h2}>Filtros</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}><Ionicons name="close" size={26} color={C.text} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 20 }}>
              <Text style={s.drawerHead}>¿Cuándo?</Text>
              <View style={s.wrap}>
                {PRESETS.map(([k, label, fn]) => {
                  const on = preset === k;
                  return (
                    <TouchableOpacity key={k} onPress={() => setPreset(k, fn(today))} style={{ marginRight: 8, marginBottom: 8 }}>
                      {on ? <Grad colors={ACC} style={s.pill}><Text style={[s.pillTxt, { color: '#fff' }]}>{label}</Text></Grad>
                        : <View style={[s.pill, s.pillOff]}><Text style={s.pillTxt}>{label}</Text></View>}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <RangeCalendar today={today} range={range} perDay={perDay} onChange={setRange} />

              <View style={[s.row, { justifyContent: 'space-between', marginTop: 18 }]}>
                <Text style={[s.drawerHead, { marginTop: 0 }]}>Categorías</Text>
                <View style={s.row}>
                  <TouchableOpacity onPress={allCats} disabled={allOn} hitSlop={8}><Text style={{ color: allOn ? C.sub : C.accent, fontWeight: '700' }}>Activar todas</Text></TouchableOpacity>
                  <Text style={{ color: C.line, marginHorizontal: 8 }}>|</Text>
                  <TouchableOpacity onPress={noCats} disabled={noneOn} hitSlop={8}><Text style={{ color: noneOn ? C.sub : C.accent, fontWeight: '700' }}>Desactivar todas</Text></TouchableOpacity>
                </View>
              </View>
              {catsPresent.map((c) => {
                const on = !off[c];
                const ci = catInfo(c);
                return (
                  <View key={c} style={s.catRow}>
                    <TouchableOpacity style={[s.row, { flex: 1 }]} onPress={() => toggleCat(c)}>
                      <View style={[s.catIcon, { backgroundColor: on ? ci.c : 'transparent', borderColor: ci.c }]}>
                        <Ionicons name={ci.i} size={15} color={on ? '#1d1142' : ci.c} />
                      </View>
                      <Text style={[s.text, { flex: 1, marginLeft: 10, opacity: on ? 1 : 0.5 }]}>{c}</Text>
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? ci.c : C.sub} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => onlyCat(c)} style={s.soloBtn}><Text style={s.soloTxt}>solo</Text></TouchableOpacity>
                  </View>
                );
              })}
              {outside && outside.length ? (
                <>
                  <Text style={s.drawerHead}>Revisa también (fuera de la app)</Text>
                  <Text style={[s.sub, { fontSize: 12, marginBottom: 4 }]}>Estas páginas no se pueden leer automáticamente. Toca para abrirlas.</Text>
                  <OutsidePages list={outside} compact />
                </>
              ) : null}
            </ScrollView>
            <View style={[s.row, { padding: 14, borderTopWidth: 1, borderTopColor: C.line }]}>
              <TouchableOpacity onPress={reset} style={[s.pill, s.pillOff, { marginRight: 10 }]}><Text style={s.pillTxt}>Restablecer</Text></TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={{ flex: 1 }}>
                <Grad colors={ACC} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.pill, { alignItems: 'center' }]}>
                  <Text style={[s.pillTxt, { color: '#fff', fontWeight: '800' }]}>{noneOn ? 'Elige al menos una categoría' : `Ver ${total} eventos`}</Text>
                </Grad>
              </TouchableOpacity>
            </View>
          </SafeBox>
        </Grad>
      </Animated.View>
    </Modal>
  );
}

// Calendario mensual: toca un día para verlo solo; toca otro para hacer un rango.
function RangeCalendar({ today, range, perDay, onChange, onDone }) {
  const [offset, setOffset] = useState(0); // 0 = mes actual, hasta +2
  const [pending, setPending] = useState(null); // primer toque de un rango nuevo
  const base = parseLocal(today);
  const first = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const monthStr = `${MESES[first.getMonth()]} ${first.getFullYear()}`;
  const lead = (first.getDay() + 6) % 7; // semana empieza en lunes
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(ymd(new Date(first.getFullYear(), first.getMonth(), d)));
  while (cells.length % 7) cells.push(null);
  const max = Math.max(1, ...Object.values(perDay));
  const [a, b] = range;
  const tap = (d) => {
    if (d < today) return;
    if (!pending) { setPending(d); onChange([d, d]); }
    else { onChange(d < pending ? [d, pending] : [pending, d]); setPending(null); }
  };
  return (
    <View style={s.calBox}>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
        <TouchableOpacity disabled={offset === 0} onPress={() => setOffset(offset - 1)} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={offset === 0 ? C.line : C.text} />
        </TouchableOpacity>
        <Text style={[s.text, { fontWeight: '800', textTransform: 'capitalize' }]}>{monthStr}</Text>
        <TouchableOpacity disabled={offset === 2} onPress={() => setOffset(offset + 1)} hitSlop={10}>
          <Ionicons name="chevron-forward" size={22} color={offset === 2 ? C.line : C.text} />
        </TouchableOpacity>
      </View>
      <View style={s.calRow}>{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x, i) => <Text key={i} style={s.calHead}>{x}</Text>)}</View>
      {Array.from({ length: cells.length / 7 }, (_, w) => (
        <View key={w} style={s.calRow}>
          {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
            if (!d) return <View key={i} style={s.calCell} />;
            const past = d < today;
            const inR = d >= a && d <= b;
            const edge = d === a || d === b;
            const n = perDay[d] || 0;
            return (
              <TouchableOpacity key={i} style={[s.calCell, inR && s.calIn, edge && s.calEdge]} onPress={() => tap(d)} disabled={past}>
                <Text style={[s.calNum, past && { color: C.line }, edge && { color: '#111' }, d === today && !edge && { color: C.accent }]}>{Number(d.slice(8))}</Text>
                {!past && n ? <View style={[s.calDot, { opacity: 0.35 + 0.65 * (n / max) }, edge && { backgroundColor: '#111' }]} /> : <View style={{ height: 5 }} />}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      <Text style={[s.sub, { fontSize: 12, marginTop: 8, textAlign: 'center' }]}>{pending ? 'Ahora toca el último día del rango' : 'Toca un día, o dos para hacer un rango'}</Text>
    </View>
  );
}
function listDays(a, b) { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; }
function fmtUpdated(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()} ${MESES_C[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Recuadro para eventos sin foto: color de su categoría + ícono grande (se ve intencional, no roto).
function NoImage({ ev, style, big }) {
  const ci = catInfo(ev.category);
  return (
    <Grad colors={[`${ci.c}66`, `${ci.c}22`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[style, { alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name={ci.i} size={big ? 46 : 24} color={ci.c} />
      {big ? <Text style={{ color: ci.c, fontWeight: '800', fontSize: 12, marginTop: 6, letterSpacing: 1, textTransform: 'uppercase' }}>{ev.category}</Text> : null}
    </Grad>
  );
}

// Imagen del evento; si no carga, muestra el recuadro de su categoría.
// Pide la imagen en tamaño de celular (no la original de 2000+ px) cuando el sitio lo permite.
const imgUri = (u, w = 700) => {
  if (!u) return u;
  if (/feverup\.com\/image\/upload\//.test(u) && !/\/upload\/[a-z]_/.test(u)) return u.replace('/image/upload/', `/image/upload/w_${w},c_limit,q_auto/`);
  return u;
};
const EvImage = React.memo(function EvImage({ ev, style, big }) {
  const [bad, setBad] = useState(false);
  if (!ev.image || bad) return <NoImage ev={ev} style={style} big={big} />;
  // resizeMethod="resize": Android reduce la imagen al decodificarla (mucho menos memoria y trabajo).
  return <Image source={{ uri: imgUri(ev.image, big ? 800 : 300) }} style={style} resizeMethod="resize" fadeDuration={120} onError={() => setBad(true)} />;
});

// Talón de boleto en la esquina de la foto: SÁB / 24 / OCT (o "HASTA 12 NOV" en temporadas).
function DateStub({ ev, occ }) {
  const longish = isLongRange(ev) || isShortRange(ev);
  const d = parseLocal(day(longish && day(ev.start) < todayStr() ? ev.end : occ.start) || todayStr());
  return (
    <View style={s.stub}>
      <Text style={s.stubTop}>{longish && day(ev.start) < todayStr() ? 'HASTA' : DIAS_C[d.getDay()].toUpperCase()}</Text>
      <Text style={s.stubDay}>{d.getDate()}</Text>
      <Text style={s.stubTop}>{MESES_C[d.getMonth()].toUpperCase()}</Text>
    </View>
  );
}

// Señales de "no te lo pierdas": demanda alta, más fechas agregadas, preventas, promos.
const MORE_DATES_DAYS = 21;
const recentMoreDates = (ev) => !!ev.moreDatesAt && daysBetween(day(ev.moreDatesAt), todayStr()) <= MORE_DATES_DAYS;
const isHot = (ev) => ev.demand === 'alta' || ev.waitlist || recentMoreDates(ev);
function nextSale(ev) {
  const o = ev.onsale;
  if (!o) return null;
  const now = `${todayStr()}T${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  const list = [...(o.presales || []).map((p) => ({ label: p.name || 'Preventa', start: p.start })), ...(o.general ? [{ label: 'Venta general', start: o.general }] : [])]
    .filter((x) => x.start && x.start > now).sort((a, b) => (a.start < b.start ? -1 : 1));
  return list.length ? list : null;
}
function DemandTags({ ev, isNew }) {
  const sale = nextSale(ev);
  const items = [];
  if (ev.soldOut) items.push(['Agotado', C.danger]);
  else if (ev.waitlist) items.push(['Lista de espera', C.danger]);
  else if (ev.demand === 'alta') items.push([ev.demandWhy ? `🔥 Alta demanda: "${ev.demandWhy}"` : '🔥 Se agota rápido', '#ff8a3d']);
  if (recentMoreDates(ev)) items.push(['🔥 Más fechas', '#ff8a3d']);
  if (sale) items.push([`🎟️ ${sale[0].label === 'Venta general' ? 'Venta' : 'Preventa'} ${fmtDayShort(day(sale[0].start))}`, C.star]);
  if (ev.promo) items.push([ev.promo, C.ok]);
  if (isNew) items.push(['Nuevo', '#7cc4ff']);
  if (!items.length) return null;
  return (
    <View style={[s.row, { marginTop: 4 }]}>
      {items.map(([t, c]) => <Text key={t} style={[s.hotTag, { color: c, borderColor: c }]}>{t}</Text>)}
    </View>
  );
}

function whenText(ev, occ) {
  return isLongRange(ev) || isShortRange(ev)
    ? `${fmtDayShort(ev.start)} – ${fmtDayShort(ev.end)}`
    : hasTime(occ.start) ? fmtTime(occ.start) : 'Horario por confirmar';
}

function EventCard({ ev, occ, fav, agendado, onPress, onLongPress, onFav, right, compact, isNew }) {
  const ci = catInfo(ev.category);
  const n = ev.dates ? ev.dates.length : 0;
  const when = whenText(ev, occ);
  const tags = (
    <View style={s.row}>
      <Text style={[s.badge, { color: ci.c }]}>{ev.category}</Text>
      {ev.price ? <Text style={s.badgeMuted} numberOfLines={1}>{ev.price}</Text> : null}
      {n > 1 ? <Text style={s.badgeMuted}>{n} funciones</Text> : null}
      {ev.manual ? <Text style={s.badgeMuted}>manual</Text> : null}
      {agendado ? <Ionicons name="calendar" size={13} color={C.ok} style={{ marginLeft: 2, marginTop: 4 }} /> : null}
    </View>
  );
  if (!compact) {
    return (
      <TouchableOpacity style={s.bigCard} onPress={onPress} onLongPress={onLongPress} delayLongPress={350} activeOpacity={0.9}>
        <View>
          <EvImage ev={ev} style={s.bigImg} big />
          <DateStub ev={ev} occ={occ} />
          {right || (
            <TouchableOpacity onPress={onFav} hitSlop={10} style={s.bigStar}>
              <Ionicons name={fav ? 'star' : 'star-outline'} size={20} color={fav ? C.star : '#fff'} />
            </TouchableOpacity>
          )}
        </View>
        <View style={{ padding: 12, paddingTop: 10 }}>
          <Text style={s.bigTitle} numberOfLines={2}>{ev.title}</Text>
          <Text style={s.cardMeta} numberOfLines={1}>{when}{ev.venue ? ` · ${ev.venue}` : ''}</Text>
          {tags}
          <DemandTags ev={ev} isNew={isNew} />
        </View>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity style={s.card} onPress={onPress} onLongPress={onLongPress} delayLongPress={350} activeOpacity={0.8}>
      <View style={[s.catBar, { backgroundColor: ci.c }]} />
      <EvImage ev={ev} style={s.thumb} />
      <View style={{ flex: 1, paddingRight: 6 }}>
        <Text style={s.cardTitle} numberOfLines={2}>{ev.title}</Text>
        <Text style={s.cardMeta} numberOfLines={1}>{when}{ev.venue ? ` · ${ev.venue}` : ''}</Text>
        {tags}
        <DemandTags ev={ev} isNew={isNew} />
      </View>
      {right || (
        <TouchableOpacity onPress={onFav} hitSlop={12} style={{ padding: 4 }}>
          <Ionicons name={fav ? 'star' : 'star-outline'} size={22} color={fav ? C.star : C.sub} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// Deslizar estilo Tinder: ← izquierda = No me interesa (se oculta), → derecha = Me interesa (⭐).
// Tocar la tarjeta sigue abriendo el detalle; el deslizamiento sólo se activa con un movimiento claramente horizontal.
const EventRow = React.memo(function EventRow({ item, act, compact, isNew, fav, agendado }) {
  const e = item.e;
  return (
    <SwipeRow onLeft={() => act.current.hideNow(e)} onRight={() => act.current.likeNow(e)}>
      <EventCard ev={e} occ={item.occ} compact={compact} isNew={isNew} fav={fav} agendado={agendado}
        onPress={() => act.current.open(e)} onLongPress={() => act.current.askHide(e)} onFav={() => act.current.toggleFav(e)} />
    </SwipeRow>
  );
}, (p, n) => p.item.e === n.item.e && p.item.occ.start === n.item.occ.start && p.compact === n.compact
  && p.isNew === n.isNew && p.fav === n.fav && p.agendado === n.agendado);

function SwipeRow({ children, onLeft, onRight }) {
  const x = React.useRef(new Animated.Value(0)).current;
  const cb = React.useRef({ onLeft, onRight });
  cb.current = { onLeft, onRight };
  const moved = React.useRef(false); // si hubo deslizamiento, el toque no abre el detalle
  const settle = () => setTimeout(() => { moved.current = false; }, 350);
  const W = Dimensions.get('window').width;
  const back = () => Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
  const pan = React.useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => { moved.current = true; x.setValue(g.dx); },
    onPanResponderRelease: (_, g) => {
      settle();
      if (g.dx < -110 || (g.dx < -40 && g.vx < -0.8)) {
        vibrar();
        Animated.timing(x, { toValue: -W, duration: 170, useNativeDriver: false }).start(() => { cb.current.onLeft(); x.setValue(0); });
      } else if (g.dx > 110 || (g.dx > 40 && g.vx > 0.8)) {
        vibrar(); cb.current.onRight(); back();
      } else back();
    },
    onPanResponderTerminate: () => { settle(); back(); },
  })).current;
  const child = React.Children.only(children);
  const guarded = React.cloneElement(child, {
    onPress: () => { if (!moved.current && child.props.onPress) child.props.onPress(); },
    onLongPress: () => { if (!moved.current && child.props.onLongPress) child.props.onLongPress(); },
  });
  const rotate = x.interpolate({ inputRange: [-W, 0, W], outputRange: ['-7deg', '0deg', '7deg'] });
  const likeO = x.interpolate({ inputRange: [0, 90], outputRange: [0, 1], extrapolate: 'clamp' });
  const nopeO = x.interpolate({ inputRange: [-90, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  return (
    <View>
      <Animated.View pointerEvents="none" style={[s.swipeBg, { backgroundColor: 'rgba(62,230,160,0.16)', opacity: likeO }]}>
        <Ionicons name="star" size={26} color={C.star} /><Text style={[s.swipeTxt, { color: C.ok }]}>Me interesa</Text>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[s.swipeBg, { justifyContent: 'flex-end', backgroundColor: 'rgba(255,107,129,0.16)', opacity: nopeO }]}>
        <Text style={[s.swipeTxt, { color: C.danger }]}>No me interesa</Text><Ionicons name="close-circle" size={26} color={C.danger} />
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }, { rotate }] }}>{guarded}</Animated.View>
    </View>
  );
}

// Póster vertical para la fila "En cartelera" (exposiciones y temporadas largas).
function Poster({ ev, onPress, onLongPress, sub, subColor }) {
  const t = todayStr();
  const left = daysBetween(t, day(ev.end));
  const closing = left <= 7;
  return (
    <TouchableOpacity style={s.poster} onPress={onPress} onLongPress={onLongPress} delayLongPress={350} activeOpacity={0.85}>
      <EvImage ev={ev} style={s.posterImg} big />
      <Text style={s.posterTitle} numberOfLines={2}>{ev.title}</Text>
      {sub ? <Text style={[s.posterSub, subColor && { color: subColor, fontWeight: '700' }]} numberOfLines={1}>{sub}</Text> : (
        <Text style={[s.posterSub, closing && { color: C.accent, fontWeight: '700' }]} numberOfLines={1}>
          {left <= 0 ? 'Último día' : closing ? `Cierra en ${left} día${left === 1 ? '' : 's'}` : `Hasta ${fmtDayShort(ev.end)}`}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// =====================================================================
// DETALLE
function DetailModal({ ev, onClose, favs, hidden, agendados, checkins, toggleFav, toggleHidden, askHide, onCalendar, onCheckin, onDeleteManual }) {
  if (!ev) return null;
  const ci = catInfo(ev.category);
  const t = todayStr();
  const occ = occurrences(ev);
  const range = isLongRange(ev) || isShortRange(ev);
  const upcoming = range ? occ : occ.filter((o) => day(o.start) >= t);
  const past = range ? [] : occ.filter((o) => day(o.start) < t);
  const tk = ticketLink(ev);
  const infoLinks = [];
  for (const x of [...(ev.sources || []), { id: 'manual', url: ev.manual ? ev.url : null }]) {
    if (x.url && !infoLinks.some((y) => y.url === x.url) && (!tk || x.url !== tk.url)) infoLinks.push({ name: SOURCE_NAMES[x.id] || x.id, url: x.url });
  }
  const fav = !!favs[ev.id];
  const isHidden = isHiddenEv(hidden, ev);
  const attended = checkins.filter((c) => c.eventId === ev.id);
  const checkinDate = range ? t : (occ.filter((o) => day(o.start) <= t).pop() || {}).start;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Screen><SafeBox>
        <View style={s.modalTop}>
          <TouchableOpacity onPress={onClose} hitSlop={12}><Ionicons name="chevron-down" size={28} color={C.text} /></TouchableOpacity>
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity onPress={() => toggleFav(ev)} style={s.iconBtn}><Ionicons name={fav ? 'star' : 'star-outline'} size={24} color={fav ? C.star : C.text} /></TouchableOpacity>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {ev.image ? <Image source={{ uri: imgUri(ev.image, 1000) }} style={s.hero} resizeMode="cover" resizeMethod="resize" /> : null}
          <View style={{ padding: 16 }}>
            <Text style={[s.badge, { color: ci.c, fontSize: 13 }]}><Ionicons name={ci.i} size={13} /> {ev.category}</Text>
            <Text style={s.h2}>{ev.title}</Text>
            {ev.venue || ev.city ? (
              <TouchableOpacity onPress={() => Linking.openURL(mapsUrl(ev))} style={[s.row, { marginTop: 8 }]} activeOpacity={0.7}>
                <Ionicons name="location" size={16} color={C.accent} />
                <Text style={[s.text, s.mapLink, { marginLeft: 8, flex: 1 }]}>{[ev.venue, ev.city].filter(Boolean).join(' · ')}</Text>
                <Ionicons name="navigate" size={16} color={C.accent} />
              </TouchableOpacity>
            ) : null}
            {range ? <InfoRow icon="calendar" text={`Del ${fmtDayLong(ev.start)} al ${fmtDayLong(ev.end)}`} /> : null}
            {ev.price ? <InfoRow icon="pricetag" text={ev.price} /> : null}
            <DemandTags ev={ev} />
            {(nextSale(ev) || []).map((x) => (
              <View key={x.start} style={[s.occRow, { marginTop: 8, borderWidth: 1, borderColor: 'rgba(255,212,59,0.4)' }]}>
                <Ionicons name="ticket" size={18} color={C.star} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.occDay}>{x.label}</Text>
                  <Text style={s.sub}>{fmtDayLong(day(x.start))}{hasTime(x.start) ? ` · ${fmtTime(x.start)}` : ''}</Text>
                </View>
                <TouchableOpacity style={s.calBtn} onPress={() => addToCalendar({ ...ev, title: `🎟️ ${x.label}: ${ev.title}`, venue: '', city: '', price: null }, { start: x.start, url: ticketLink(ev) ? ticketLink(ev).url : ev.url })}>
                  <Ionicons name="alarm" size={16} color="#111" /><Text style={s.calTxt}>Recordar</Text>
                </TouchableOpacity>
              </View>
            ))}
            {ev.description ? <Description text={ev.description} /> : null}

            <Text style={s.h3}>{range ? 'Agendar' : upcoming.length > 1 ? `Funciones (${upcoming.length})` : 'Fecha'}</Text>
            {upcoming.length === 0 ? <Text style={s.sub}>Ya no hay funciones próximas.</Text> : null}
            {upcoming.slice(0, 40).map((o, i) => (
              <View key={i} style={s.occRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.occDay}>{range ? 'Visita cuando quieras' : relativeLabel(day(o.start))}</Text>
                  <Text style={s.sub}>{range ? `Hasta el ${fmtDayLong(ev.end)}` : hasTime(o.start) ? fmtTime(o.start) : 'Horario por confirmar'}{o.price ? ` · ${o.price}` : ''}</Text>
                  {o.avail === 'agotado' ? <Text style={[s.sub, { color: C.danger, fontWeight: '700' }]}>Agotada</Text>
                    : o.avail === 'ultimos' ? <Text style={[s.sub, { color: '#ff8a3d', fontWeight: '700' }]}>🔥 Últimos boletos{o.left ? ` · quedan ${o.left}` : ''}</Text> : null}
                </View>
                <TouchableOpacity style={s.calBtn} onPress={() => onCalendar(ev, range ? { start: t, end: null, url: ev.url } : o)}>
                  <Ionicons name="calendar" size={16} color="#111" />
                  <Text style={s.calTxt}>Agendar</Text>
                </TouchableOpacity>
              </View>
            ))}
            {agendados[ev.id] ? <Text style={[s.sub, { color: C.ok, marginTop: 6 }]}>✓ Ya lo agregaste a tu calendario</Text> : null}

            <View style={s.actions}>
              {tk ? (
                <TouchableOpacity onPress={() => Linking.openURL(tk.url)} activeOpacity={0.85} style={{ marginBottom: 8 }}>
                  <Grad colors={ACC} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.buyBtn}>
                    <Ionicons name="ticket" size={20} color="#fff" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.buyTxt}>{tk.direct ? 'Comprar boletos' : 'Buscar boletos'}</Text>
                      <Text style={s.buySub}>{tk.direct ? `en ${tk.vendor}` : `en ${tk.vendor} · puede que no esté a la venta ahí`}</Text>
                    </View>
                    <Ionicons name="open-outline" size={18} color="#fff" />
                  </Grad>
                </TouchableOpacity>
              ) : isFree(ev) ? (
                <View style={[s.actionBtn, { borderWidth: 1, borderColor: C.ok }]}><Ionicons name="gift" size={18} color={C.ok} /><Text style={[s.actionTxt, { color: C.ok }]}>Entrada libre · no necesitas boleto</Text></View>
              ) : null}
              {checkinDate ? <ActionBtn icon="checkmark-circle" label={attended.length ? 'Ver mi check-in' : 'Asistí ✅'} color={C.ok} onPress={() => onCheckin(ev, checkinDate)} /> : null}
              <ActionBtn icon={isHidden ? 'eye' : 'eye-off'} label={isHidden ? 'Mostrar de nuevo' : 'No me interesa'} color={C.danger}
                onPress={() => { if (isHidden) toggleHidden(ev); else { onClose(); askHide(ev); } }} />
              {ev.manual ? <ActionBtn icon="trash" label="Borrar evento manual" color={C.danger}
                onPress={() => Alert.alert('Borrar', '¿Borrar este evento manual?', [{ text: 'Cancelar' }, { text: 'Borrar', style: 'destructive', onPress: () => onDeleteManual(ev.id) }])} /> : null}
            </View>

            {past.length ? <Text style={[s.sub, { marginTop: 14 }]}>{past.length} función(es) ya pasaron.</Text> : null}
            {infoLinks.length ? (
              <View style={{ marginTop: 10 }}>
                <Text style={s.h3}>Página del evento</Text>
                {infoLinks.map((l) => (
                  <TouchableOpacity key={l.url} style={s.linkRow} onPress={() => Linking.openURL(l.url)}>
                    <Ionicons name="globe-outline" size={16} color={C.sub} />
                    <Text style={[s.text, { flex: 1, marginLeft: 8 }]}>{l.name}</Text>
                    <Ionicons name="open-outline" size={16} color={C.sub} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </SafeBox></Screen>
    </Modal>
  );
}
// Abre Google Maps buscando el lugar (en Android abre la app de Maps si está instalada).
function mapsUrl(ev) {
  const place = (ev.venue || '').split('|')[0].trim();
  const q = [place, ev.city || 'Monterrey', 'Nuevo León'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
function Description({ text }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220;
  return (
    <View style={s.descBox}>
      <Text style={s.desc} numberOfLines={open || !long ? undefined : 4}>{text}</Text>
      {long ? <TouchableOpacity onPress={() => setOpen(!open)}><Text style={s.more}>{open ? 'Ver menos' : 'Ver más'}</Text></TouchableOpacity> : null}
    </View>
  );
}
const InfoRow = ({ icon, text }) => (
  <View style={[s.row, { marginTop: 8 }]}><Ionicons name={icon} size={16} color={C.sub} /><Text style={[s.text, { marginLeft: 8, flex: 1 }]}>{text}</Text></View>
);
const ActionBtn = ({ icon, label, onPress, color = C.text }) => (
  <TouchableOpacity style={s.actionBtn} onPress={onPress}>
    <Ionicons name={icon} size={18} color={color} />
    <Text style={[s.actionTxt, { color }]}>{label}</Text>
  </TouchableOpacity>
);

// =====================================================================
// MIS EVENTOS
function MisEventos({ allEvents, byId, favs, hidden, unhide, agendados, checkins, toggleFav, open, onOpenCheckin, onAddManual }) {
  const [seg, setSeg] = useState('interesan');
  const t = todayStr();
  const interesan = useMemo(() => Object.keys(favs).map((id) => byId[id]).filter(Boolean)
    .map((e) => ({ e, occ: nextOccurrence(e, t) || (isLongRange(e) && day(e.end) >= t ? { start: e.start } : null) }))
    .filter((x) => x.occ).sort((a, b) => (a.occ.start < b.occ.start ? -1 : 1)), [favs, byId, t]);
  const manualFuturos = allEvents.filter((e) => e.manual && day(e.end || e.start) >= t);
  const mesActual = t.slice(0, 7);
  const delMes = checkins.filter((c) => day(c.date).slice(0, 7) === mesActual).length;
  const delAnio = checkins.filter((c) => day(c.date).slice(0, 4) === t.slice(0, 4)).length;
  // "No me interesa": cada regla guardada, con los eventos que está escondiendo ahora mismo.
  const ocultos = useMemo(() => Object.entries(hidden || {}).map(([key, h]) => {
    const info = h && typeof h === 'object' ? h : {};
    const lugar = info.kind === 'lugar' || key.startsWith('v:');
    const matches = allEvents.filter((e) => (lugar ? e.venue && venueKey(e) === key : e.id === key || titleKey(e) === key));
    const next = matches.map((e) => ({ e, occ: nextOccurrence(e, t) })).filter((x) => x.occ).sort((a, b) => (a.occ.start < b.occ.start ? -1 : 1))[0];
    return { key, lugar, title: info.title || (matches[0] && matches[0].title) || key.replace(/^[tv]:/, ''), at: info.at || '', count: matches.length, next };
  }).sort((a, b) => (a.at < b.at ? 1 : -1)), [hidden, allEvents, t]);

  return (
    <View style={{ flex: 1 }}>
      <View style={[s.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <View>
          <Text style={s.h1}>Mis eventos</Text>
          <Text style={s.sub}>{delMes} este mes · {delAnio} en {t.slice(0, 4)}</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={onAddManual}><Ionicons name="add" size={20} color="#111" /><Text style={s.calTxt}>Manual</Text></TouchableOpacity>
      </View>
      <View style={[s.row, { paddingHorizontal: 12, marginBottom: 8 }]}>
        {[['interesan', `Me interesan (${interesan.length})`], ['asisti', `Asistí (${checkins.length})`], ['ocultos', `No me interesa (${ocultos.length})`]].map(([k, l]) => (
          <TouchableOpacity key={k} onPress={() => setSeg(k)} style={[s.seg, seg === k && s.segOn]}><Text style={[s.segTxt, seg === k && s.segTxtOn]}>{l}</Text></TouchableOpacity>
        ))}
      </View>
      {seg === 'interesan' ? (
        <FlatList
          data={interesan}
          keyExtractor={(x) => x.e.id}
          renderItem={({ item }) => (
            <View>
              <Text style={s.miniHead}>{isLongRange(item.e) ? 'En cartelera' : relativeLabel(day(item.occ.start))}</Text>
              <EventCard compact ev={item.e} occ={item.occ} fav agendado={!!agendados[item.e.id]} onPress={() => open(item.e)} onFav={() => toggleFav(item.e)} />
            </View>
          )}
          ListHeaderComponent={manualFuturos.length ? <Text style={[s.sub, { paddingHorizontal: 16, paddingBottom: 6 }]}>Tus eventos manuales también aparecen en Explorar.</Text> : null}
          ListEmptyComponent={<Empty icon="star-outline" text="Toca la ⭐ en cualquier evento para guardarlo aquí." />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      ) : seg === 'ocultos' ? (
        <FlatList
          data={ocultos}
          keyExtractor={(x) => x.key}
          ListHeaderComponent={ocultos.length ? <Text style={[s.sub, { paddingHorizontal: 16, paddingBottom: 6, fontSize: 12 }]}>Estos no aparecen en Explorar (tampoco sus fechas futuras). Si te equivocaste, toca "Volver a mostrar".</Text> : null}
          renderItem={({ item: x }) => (
            <View style={s.card}>
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} disabled={!x.next} onPress={() => x.next && open(x.next.e)} activeOpacity={0.7}>
                <View style={[s.thumb, { backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name={x.lugar ? 'location' : 'eye-off'} size={22} color={C.sub} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle} numberOfLines={2}>{x.lugar ? `Todo en ${x.title}` : x.title}</Text>
                  <Text style={s.cardMeta} numberOfLines={1}>
                    {x.lugar ? `${x.count} evento(s) ocultos` : x.next ? `Próxima fecha: ${fmtDayLong(day(x.next.occ.start))}` : 'Sin fechas próximas'}
                  </Text>
                  {x.at ? <Text style={s.badgeMuted}>Ocultado el {fmtDayLong(x.at)}</Text> : null}
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => unhide(x.key)} style={s.unhideBtn}>
                <Ionicons name="eye" size={16} color={C.accent} />
                <Text style={{ color: C.accent, fontWeight: '700', fontSize: 12, marginLeft: 4 }}>Volver a{'\n'}mostrar</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Empty icon="eye-off-outline" text={'Aquí verás lo que marques con "No me interesa".\nSi te equivocas, lo puedes regresar desde aquí.'} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      ) : (
        <FlatList
          data={[...checkins].sort((a, b) => (a.date < b.date ? 1 : -1))}
          keyExtractor={(c) => c.id}
          renderItem={({ item: c }) => (
            <TouchableOpacity style={s.card} onPress={() => onOpenCheckin(c.id)}>
              <View style={[s.catBar, { backgroundColor: catInfo(c.category).c }]} />
              {c.photos[0] || c.image ? <Image source={{ uri: c.photos[0] || c.image }} style={s.thumb} /> : (
                <View style={[s.thumb, { backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="checkmark-circle" size={22} color={C.ok} /></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle} numberOfLines={2}>{c.title}</Text>
                <Text style={s.cardMeta}>{fmtDayLong(day(c.date))}{c.venue ? ` · ${c.venue}` : ''}</Text>
                <Text style={s.badgeMuted}>{c.photos.length ? `📷 ${c.photos.length} foto(s)` : 'Sin fotos aún'}{c.note ? ' · 📝' : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.sub} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Empty icon="checkmark-circle-outline" text={'Cuando vayas a un evento, ábrelo y toca "Asistí ✅".\nAquí se guarda con tus fotos para el recap.'} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}
const Empty = ({ icon, text }) => (
  <View style={[s.center, { paddingTop: 60 }]}><Ionicons name={icon} size={42} color={C.sub} /><Text style={[s.sub, { textAlign: 'center', marginTop: 8, paddingHorizontal: 30 }]}>{text}</Text></View>
);

// ---------------- Check-in ----------------
function CheckinModal({ checkin, onClose, onSave, onDelete }) {
  const [note, setNote] = useState('');
  const [viewer, setViewer] = useState(null);
  useEffect(() => { if (checkin) setNote(checkin.note || ''); }, [checkin && checkin.id]);
  if (!checkin) return null;
  const addPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso', 'Necesito acceso a tus fotos para agregarlas.'); return; }
    const uris = await pickPhotos();
    if (uris.length) onSave({ ...checkin, photos: [...checkin.photos, ...uris] });
  };
  const removePhoto = (u) => Alert.alert('Quitar foto', '¿Quitar esta foto del evento? (No se borra de tu galería)', [
    { text: 'Cancelar' }, { text: 'Quitar', style: 'destructive', onPress: () => { onSave({ ...checkin, photos: checkin.photos.filter((p) => p !== u) }); setViewer(null); } },
  ]);
  return (
    <Modal visible animationType="slide" onRequestClose={() => { onSave({ ...checkin, note }); onClose(); }} statusBarTranslucent navigationBarTranslucent>
      <Screen><SafeBox>
        <View style={s.modalTop}>
          <TouchableOpacity onPress={() => { onSave({ ...checkin, note }); onClose(); }} hitSlop={12}><Ionicons name="chevron-down" size={28} color={C.text} /></TouchableOpacity>
          <TouchableOpacity onPress={() => Alert.alert('Quitar check-in', '¿Quitar este evento de "Asistí"?', [{ text: 'Cancelar' }, { text: 'Quitar', style: 'destructive', onPress: () => onDelete(checkin.id) }])}>
            <Ionicons name="trash-outline" size={22} color={C.danger} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={[s.badge, { color: C.ok }]}>✅ Asististe</Text>
          <Text style={s.h2}>{checkin.title}</Text>
          <InfoRow icon="calendar" text={`${fmtDayLong(day(checkin.date))}${hasTime(checkin.date) ? ` · ${fmtTime(checkin.date)}` : ''}`} />
          {checkin.venue ? <InfoRow icon="location" text={[checkin.venue, checkin.city].filter(Boolean).join(' · ')} /> : null}

          <View style={[s.row, { justifyContent: 'space-between', marginTop: 20 }]}>
            <Text style={s.h3}>Fotos ({checkin.photos.length})</Text>
            <TouchableOpacity style={s.calBtn} onPress={addPhotos}><Ionicons name="images" size={16} color="#111" /><Text style={s.calTxt}>Agregar</Text></TouchableOpacity>
          </View>
          <View style={s.grid}>
            {checkin.photos.map((u) => (
              <TouchableOpacity key={u} onPress={() => setViewer(u)} onLongPress={() => removePhoto(u)}>
                <Image source={{ uri: u }} style={s.gridImg} />
              </TouchableOpacity>
            ))}
          </View>
          {!checkin.photos.length ? <Text style={s.sub}>Elige solo las fotos que quieras guardar de este evento.</Text> : <Text style={[s.sub, { fontSize: 12 }]}>Mantén presionada una foto para quitarla.</Text>}

          <Text style={[s.h3, { marginTop: 20 }]}>Nota</Text>
          <TextInput value={note} onChangeText={setNote} onEndEditing={() => onSave({ ...checkin, note })} placeholder="¿Qué tal estuvo? ¿Con quién fuiste?"
            placeholderTextColor={C.sub} multiline style={s.noteInput} />
        </ScrollView>
        <Modal visible={!!viewer} transparent onRequestClose={() => setViewer(null)}>
          <TouchableOpacity style={s.viewer} activeOpacity={1} onPress={() => setViewer(null)}>
            {viewer ? <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
            <Text style={s.sub}>Toca para cerrar · mantén presionado en la cuadrícula para quitar</Text>
          </TouchableOpacity>
        </Modal>
      </SafeBox></Screen>
    </Modal>
  );
}

// ---------------- Evento manual ----------------
function ManualModal({ visible, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState(new Date());
  const [withTime, setWithTime] = useState(true);
  const [cat, setCat] = useState('Música');
  const [picker, setPicker] = useState(null);
  const [link, setLink] = useState('');
  useEffect(() => { if (visible) { setTitle(''); setVenue(''); setLink(''); setDate(new Date()); setWithTime(true); setCat('Música'); } }, [visible]);
  const submit = () => {
    if (!title.trim()) { Alert.alert('Falta el nombre', 'Escribe cómo se llama el evento.'); return; }
    const start = withTime ? `${ymd(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}` : ymd(date);
    onSave({ id: `m${Date.now()}`, title: title.trim(), venue: venue.trim(), city: '', start, end: null, category: cat, price: null, url: link.trim() || null, image: null });
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Screen><SafeBox>
        <View style={s.modalTop}>
          <TouchableOpacity onPress={onClose}><Text style={[s.text, { color: C.sub }]}>Cancelar</Text></TouchableOpacity>
          <Text style={s.h3}>Evento manual</Text>
          <TouchableOpacity onPress={submit}><Text style={[s.text, { color: C.accent, fontWeight: '700' }]}>Guardar</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>Nombre</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Ej. Concierto en el Parque Fundidora" placeholderTextColor={C.sub} style={s.input} />
          <Text style={s.label}>Lugar</Text>
          <TextInput value={venue} onChangeText={setVenue} placeholder="Opcional" placeholderTextColor={C.sub} style={s.input} />
          <Text style={s.label}>Fecha y hora</Text>
          <View style={s.row}>
            <TouchableOpacity style={s.pickBtn} onPress={() => setPicker('date')}><Ionicons name="calendar" size={16} color={C.text} /><Text style={s.text}>  {fmtDayLong(ymd(date))}</Text></TouchableOpacity>
            {withTime ? <TouchableOpacity style={s.pickBtn} onPress={() => setPicker('time')}><Ionicons name="time" size={16} color={C.text} /><Text style={s.text}>  {fmtTime(`${ymd(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`)}</Text></TouchableOpacity> : null}
          </View>
          <TouchableOpacity onPress={() => setWithTime(!withTime)} style={[s.row, { marginTop: 8 }]}>
            <Ionicons name={withTime ? 'checkbox' : 'square-outline'} size={20} color={C.accent} /><Text style={[s.text, { marginLeft: 6 }]}>Tiene hora</Text>
          </TouchableOpacity>
          {picker ? (
            <DateTimePicker value={date} mode={picker} is24Hour={false} display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(e, d) => { setPicker(Platform.OS === 'ios' ? picker : null); if (d) setDate(d); }} />
          ) : null}
          <Text style={s.label}>Categoría</Text>
          <View style={s.wrap}>
            {Object.keys(CAT).map((c) => (
              <TouchableOpacity key={c} onPress={() => setCat(c)} style={[s.chip, cat === c && { backgroundColor: catInfo(c).c, borderColor: catInfo(c).c }]}>
                <Text style={[s.chipTxt, cat === c && { color: '#111' }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.label}>Link (opcional)</Text>
          <TextInput value={link} onChangeText={setLink} placeholder="Boletos, Instagram…" placeholderTextColor={C.sub} style={s.input} autoCapitalize="none" />
        </ScrollView>
      </SafeBox></Screen>
    </Modal>
  );
}

// =====================================================================
// FUENTES / AJUSTES
function Ajustes({ data, hidden, toggleHiddenId, onRefresh, backup, onRestore }) {
  const [busy, setBusy] = useState(false);
  const sources = (data && data.sources) || [];
  const notIncluded = (data && data.notIncluded) || [];
  const exportar = async () => {
    const json = JSON.stringify({ app: 'eventos-nl', version: 1, exportedAt: new Date().toISOString(), ...backup });
    try {
      const fs = getFS();
      if (fs && (await Sharing.isAvailableAsync())) {
        const f = new fs.File(fs.Paths.cache, `eventos-nl-respaldo-${todayStr()}.json`);
        if (f.exists) f.delete();
        f.create();
        f.write(json);
        await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: 'Guardar respaldo' });
      } else {
        await Share.share({ message: json, title: 'Respaldo Eventos NL' });
      }
    } catch (e) { Alert.alert('No se pudo exportar', String(e.message || e)); }
  };
  const importar = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
      if (r.canceled) return;
      const fs = getFS();
      const uri = r.assets[0].uri;
      const txt = fs ? await new fs.File(uri).text() : await (await fetch(uri)).text();
      const b = JSON.parse(txt);
      if (b.app !== 'eventos-nl') throw new Error('Ese archivo no es un respaldo de Eventos NL');
      Alert.alert('Restaurar respaldo', `Se reemplazarán tus datos actuales con el respaldo del ${fmtUpdated(b.exportedAt)} (${(b.checkins || []).length} check-ins).`, [
        { text: 'Cancelar' }, { text: 'Restaurar', onPress: () => onRestore(b) },
      ]);
    } catch (e) { Alert.alert('No se pudo importar', String(e.message || e)); }
  };
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={s.header}>
        <Text style={s.h1}>Fuentes</Text>
        <Text style={s.sub}>{data ? `Última actualización: ${fmtUpdated(data.generatedAt)} · ${data.total} eventos` : 'Sin datos aún'}</Text>
      </View>
      <Text style={[s.sub, { marginHorizontal: 16, marginBottom: 8, fontSize: 12 }]}>Toca una fuente para abrir su página de eventos.</Text>
      <TouchableOpacity style={[s.actionBtn, { marginHorizontal: 12 }]} onPress={async () => { setBusy(true); await onRefresh(); setBusy(false); }}>
        {busy ? <ActivityIndicator color={C.accent} /> : <Ionicons name="refresh" size={18} color={C.accent} />}
        <Text style={[s.actionTxt, { color: C.accent }]}>Volver a descargar la lista</Text>
      </TouchableOpacity>
      <View style={s.box}>
        {sources.map((src) => (
          <TouchableOpacity key={src.id} style={s.srcRow} onPress={() => src.home && Linking.openURL(src.home)} activeOpacity={0.7}>
            <Ionicons name={src.ok ? 'checkmark-circle' : src.skipped ? 'remove-circle' : 'alert-circle'} size={18} color={src.ok ? C.ok : src.skipped ? C.sub : C.danger} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={s.text}>{src.name}</Text>
              {src.error ? <Text style={[s.sub, { fontSize: 12 }]}>{src.error}</Text> : null}
              {src.warning ? <Text style={[s.sub, { fontSize: 12, color: C.accent }]}>⚠ {src.warning}</Text> : null}
            </View>
            <Text style={[s.text, { fontWeight: '700' }]}>{src.count}</Text>
            <Ionicons name="open-outline" size={15} color={C.sub} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        ))}
      </View>

      {notIncluded.length ? (
        <>
          <Text style={s.secHead}>Revisa por fuera ({notIncluded.filter((x) => x.status !== 'indirecto').length})</Text>
          <Text style={[s.sub, { marginHorizontal: 16, marginBottom: 6, fontSize: 12 }]}>La app no puede leer estas páginas. Toca una para ver sus eventos.</Text>
          <OutsidePages list={notIncluded.filter((x) => x.status !== 'indirecto')} />
          <Text style={s.secHead}>Llegan por otra fuente</Text>
          <View style={s.box}>
            {notIncluded.filter((x) => x.status === 'indirecto').map((x) => (
              <View key={x.name} style={s.srcRow}>
                <Ionicons name="git-branch" size={18} color={C.ok} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={s.text}>{x.name}</Text>
                  <Text style={[s.sub, { fontSize: 12 }]}>{x.reason}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text style={s.secHead}>Ocultos ({Object.keys(hidden).length})</Text>
      <View style={s.box}>
        {Object.entries(hidden).length ? Object.entries(hidden).map(([id, h]) => (
          <View key={id} style={s.srcRow}>
            <Ionicons name={h && h.kind === 'lugar' ? 'location' : 'eye-off'} size={16} color={C.sub} style={{ marginRight: 8 }} />
            <Text style={[s.text, { flex: 1 }]} numberOfLines={1}>{h && h.kind === 'lugar' ? `Todo en ${h.title}` : (h && h.title) || id}</Text>
            <TouchableOpacity onPress={() => toggleHiddenId(id)}><Text style={{ color: C.accent }}>Mostrar</Text></TouchableOpacity>
          </View>
        )) : <Text style={[s.sub, { padding: 12 }]}>Mantén presionado un evento en la lista (o usa "No me interesa" en su detalle) para ocultarlo. También puedes ocultar todo lo de un lugar.</Text>}
      </View>

      <Text style={s.secHead}>Respaldo</Text>
      <View style={s.box}>
        <Text style={[s.sub, { padding: 12 }]}>Guarda tus "Me interesa", check-ins, notas y eventos manuales en un archivo (Drive, correo…). Las fotos se quedan en tu galería; el respaldo guarda a qué evento pertenece cada una.</Text>
        <View style={[s.row, { padding: 12, paddingTop: 0 }]}>
          <TouchableOpacity style={[s.calBtn, { marginRight: 10 }]} onPress={exportar}><Ionicons name="cloud-upload" size={16} color="#111" /><Text style={s.calTxt}>Exportar</Text></TouchableOpacity>
          <TouchableOpacity style={[s.calBtn, { backgroundColor: C.card2 }]} onPress={importar}><Ionicons name="cloud-download" size={16} color={C.text} /><Text style={[s.calTxt, { color: C.text }]}>Importar</Text></TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

// =====================================================================
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  h1: { color: C.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  h2: { color: C.text, fontSize: 22, fontWeight: '800', marginTop: 6 },
  h3: { color: C.text, fontSize: 16, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  text: { color: C.text, fontSize: 14 },
  sub: { color: C.sub, fontSize: 13 },
  warn: { color: C.star, fontSize: 12, paddingHorizontal: 16, paddingBottom: 6 },
  desc: { color: C.text, fontSize: 14, lineHeight: 21, opacity: 0.92 },
  descBox: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 12, marginTop: 14 },
  more: { color: C.accent, fontWeight: '700', marginTop: 6 },
  mapLink: { textDecorationLine: 'underline', textDecorationColor: 'rgba(255,107,74,0.6)' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  segRow: { flexGrow: 0, marginBottom: 8 },
  seg: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 18, backgroundColor: C.card, marginRight: 6 },
  segOn: { backgroundColor: C.accent },
  segTxt: { color: C.sub, fontWeight: '600', fontSize: 13 },
  segTxtOn: { color: '#111' },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: C.line, marginRight: 6, marginBottom: 6 },
  chipTxt: { color: C.text, fontSize: 12, marginLeft: 4 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.10)', marginHorizontal: 12, borderRadius: 10, paddingHorizontal: 10, marginBottom: 6 },
  searchInput: { flex: 1, color: C.text, paddingVertical: 8, marginLeft: 6 },
  secHead: { color: C.text, fontWeight: '800', fontSize: 15, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, backgroundColor: 'rgba(29,17,66,0.96)' },
  secCount: { color: C.sub, fontWeight: '400' },
  miniHead: { color: C.sub, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, marginHorizontal: 12, marginVertical: 5, borderRadius: 16, overflow: 'hidden', paddingRight: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  catBar: { width: 5, alignSelf: 'stretch' },
  thumb: { width: 68, height: 68, borderRadius: 12, margin: 8 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  cardMeta: { color: C.sub, fontSize: 12, marginTop: 2 },
  badge: { fontSize: 11, fontWeight: '700', marginTop: 4, marginRight: 8 },
  badgeMuted: { color: C.sub, fontSize: 11, marginTop: 4, marginRight: 8, maxWidth: 160 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: 'rgba(16,9,40,0.92)', paddingBottom: Platform.OS === 'ios' ? 0 : 6 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabTxt: { color: C.sub, fontSize: 11, marginTop: 2 },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  iconBtn: { marginLeft: 14 },
  hero: { width: '100%', height: 220, backgroundColor: C.card },
  occRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 10, padding: 12, marginBottom: 6 },
  occDay: { color: C.text, fontWeight: '700' },
  calBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  calTxt: { color: '#111', fontWeight: '700', marginLeft: 6 },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  actions: { marginTop: 18 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, padding: 14, borderRadius: 12, marginBottom: 8 },
  actionTxt: { fontWeight: '600', marginLeft: 10, fontSize: 15 },
  box: { backgroundColor: C.card, marginHorizontal: 12, borderRadius: 12, marginTop: 8 },
  srcRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  gridImg: { width: 104, height: 104, margin: 3, borderRadius: 8, backgroundColor: C.card },
  noteInput: { backgroundColor: C.card, color: C.text, borderRadius: 10, padding: 12, minHeight: 90, textAlignVertical: 'top' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  label: { color: C.sub, fontSize: 13, marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  rangeBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  rangeTxt: { color: C.text, fontWeight: '800', fontSize: 16 },
  rangeCount: { color: C.text, fontWeight: '800', fontSize: 18, marginRight: 4 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22 },
  filterTxt: { color: '#fff', fontWeight: '800', marginLeft: 6 },
  filterBadge: { backgroundColor: '#fff', borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', marginLeft: 6, paddingHorizontal: 4 },
  filterBadgeTxt: { color: C.pink, fontWeight: '800', fontSize: 11 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,2,20,0.6)' },
  drawer: { position: 'absolute', top: 0, bottom: 0, right: 0, borderTopLeftRadius: 22, borderBottomLeftRadius: 22, overflow: 'hidden' },
  drawerHead: { color: C.sub, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 10 },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  pillOff: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  pillTxt: { color: C.text, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, padding: 12, marginTop: 14, borderWidth: 1, borderColor: 'transparent' },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  catIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  soloBtn: { marginLeft: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: C.card },
  soloTxt: { color: C.sub, fontSize: 12, fontWeight: '700' },
  calBox: { backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 4, borderRadius: 16, padding: 10 },
  calRow: { flexDirection: 'row' },
  calHead: { flex: 1, textAlign: 'center', color: C.sub, fontSize: 12, marginBottom: 4 },
  calCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 5, borderRadius: 8 },
  calIn: { backgroundColor: 'rgba(255,122,69,0.18)', borderRadius: 0 },
  calEdge: { backgroundColor: C.accent, borderRadius: 8 },
  calNum: { color: C.text, fontSize: 14, fontWeight: '600' },
  calDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.accent, marginTop: 2 },
  buyBtn: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14 },
  buyTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  buySub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1 },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  unhideBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.accent },
  bigCard: { backgroundColor: C.card, marginHorizontal: 12, marginVertical: 6, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  bigImg: { width: '100%', height: 150, backgroundColor: C.card2 },
  bigTitle: { color: C.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  bigStar: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(10,6,25,0.55)', borderRadius: 18, padding: 7 },
  stub: { position: 'absolute', top: 10, left: 10, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, alignItems: 'center', minWidth: 48 },
  stubTop: { color: '#1a1035', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  stubDay: { color: C.accent, fontSize: 20, fontWeight: '900', lineHeight: 22 },
  swipeBg: { ...StyleSheet.absoluteFillObject, marginHorizontal: 12, marginVertical: 6, borderRadius: 18, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22 },
  swipeTxt: { fontWeight: '800', fontSize: 15, marginHorizontal: 8 },
  poster: { width: 132, marginRight: 10 },
  posterImg: { width: 132, height: 176, borderRadius: 14, backgroundColor: C.card2 },
  posterTitle: { color: C.text, fontSize: 13, fontWeight: '700', marginTop: 6 },
  posterSub: { color: C.sub, fontSize: 11, marginTop: 2 },
  rowHead: { color: C.text, fontWeight: '800', fontSize: 15, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  hint: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,107,74,0.10)', borderColor: 'rgba(255,107,74,0.35)', borderWidth: 1, marginHorizontal: 12, marginTop: 6, borderRadius: 12, padding: 10 },
  viewBtn: { alignItems: 'center', marginRight: 10, paddingHorizontal: 6 },
  viewTxt: { color: C.sub, fontSize: 10, marginTop: 1 },
  toast: { position: 'absolute', left: 12, right: 12, bottom: 10, backgroundColor: '#2a2148', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  toastTxt: { color: C.text, flex: 1, fontSize: 13, marginRight: 10 },
  toastUndo: { color: C.accent, fontWeight: '800' },
  hotTag: { fontSize: 11, fontWeight: '800', borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginRight: 6, marginTop: 2, overflow: 'hidden' },
  pickBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginRight: 8 },
});
