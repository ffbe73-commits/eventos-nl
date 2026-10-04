// Punto de entrada de la app instalada (APK).
// Si algo falla al arrancar, en lugar de cerrarse muestra el error en pantalla para poder corregirlo.
import React from 'react';
import { registerRootComponent } from 'expo';
import { ScrollView, Text, View, Share, TouchableOpacity } from 'react-native';

let App = null;
let initError = null;
try { App = require('./App').default; } catch (e) { initError = e; }

const listeners = new Set();
let lastError = null;
if (global.ErrorUtils) {
  const prev = global.ErrorUtils.getGlobalHandler();
  global.ErrorUtils.setGlobalHandler((e, isFatal) => {
    if (isFatal) { lastError = e; listeners.forEach((fn) => fn(e)); return; }
    prev && prev(e, isFatal);
  });
}

function ErrorScreen({ error }) {
  const msg = `${(error && error.message) || String(error)}\n\n${(error && error.stack) || ''}`.slice(0, 4000);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#160c33' }} contentContainerStyle={{ padding: 24, paddingTop: 70 }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>La app encontró un error</Text>
      <Text style={{ color: '#c3bce3', marginTop: 8 }}>Tómale captura a esta pantalla y mándasela a Claude.</Text>
      <TouchableOpacity onPress={() => Share.share({ message: msg })} style={{ marginTop: 16, backgroundColor: '#ff6b4a', padding: 12, borderRadius: 12, alignSelf: 'flex-start' }}>
        <Text style={{ color: '#fff', fontWeight: '800' }}>Compartir el error</Text>
      </TouchableOpacity>
      <View style={{ marginTop: 18, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
        <Text selectable style={{ color: '#ffb4a8', fontSize: 12 }}>{msg}</Text>
      </View>
    </ScrollView>
  );
}

class Raiz extends React.Component {
  state = { error: initError || lastError };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidMount() { this.fn = (e) => this.setState({ error: e }); listeners.add(this.fn); }
  componentWillUnmount() { listeners.delete(this.fn); }
  render() {
    if (this.state.error || !App) return <ErrorScreen error={this.state.error || new Error('No se pudo cargar App.js')} />;
    return <App />;
  }
}

registerRootComponent(Raiz);
