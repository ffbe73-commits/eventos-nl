#!/bin/bash
# Usa la app como lo haría una persona (abrir filtros, cambiar categorías y fechas, deslizar)
# y anota si la app sigue viva después de cada paso. Lo corre el workflow "Diagnosticar APK".
PKG=com.ediel.eventosnl
mkdir -p capturas
paso=0
foto() { paso=$((paso+1)); adb exec-out screencap -p > "capturas/$(printf %02d $paso)-$1.png"; }
viva() { if adb shell pidof $PKG >/dev/null; then echo "   ✓ la app sigue abierta"; else echo "   ✗ LA APP SE CERRÓ después de: $1"; foto cerrada; exit 0; fi; }
tap() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1
  xy=$(python3 - "$1" <<'PY'
import re, sys
t = sys.argv[1]
try: x = open('ui.xml', encoding='utf-8').read()
except Exception: sys.exit()
for n in re.findall(r'<node [^>]*>', x):
    if re.search(r'(text|content-desc)="' + re.escape(t), n):
        b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
        if b:
            x1, y1, x2, y2 = map(int, b.groups()); print((x1 + x2) // 2, (y1 + y2) // 2); break
PY
)
  if [ -n "$xy" ]; then echo "→ toco \"$1\" ($xy)"; adb shell input tap $xy; else echo "→ no encontré \"$1\" en pantalla"; fi
  sleep 3; viva "$1"
}
desliza() { echo "→ $1"; adb shell input swipe $2 $3 $4 $5 ${6:-250}; sleep 3; viva "$1"; }

echo "== Abrir la app =="
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 30; viva "abrir"; foto inicio
echo "== Filtros =="
tap "Filtros"; foto filtros
tap "Desactivar todas"; foto ninguna
tap "Activar todas"
tap "Este finde"; foto finde
tap "3 meses"
tap "Hoy"
tap "solo"; foto solo-una
tap "Restablecer"
tap "Ver "; foto lista
echo "== Lista =="
desliza "scroll hacia abajo" 540 1800 540 500 300
desliza "scroll hacia abajo" 540 1800 540 500 300
desliza "deslizar tarjeta a la izquierda (no me interesa)" 900 1400 100 1420 200; foto deslizar
tap "Compacta"; foto compacta
desliza "scroll hacia abajo" 540 1800 540 500 300
tap "Buscar evento"; adb shell input text "jazz"; sleep 3; viva "buscar"; foto buscar
echo "== Fin: la app aguantó todos los pasos =="
