import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, Linking, FlatList,
  TouchableOpacity, RefreshControl, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import Constants from 'expo-constants';
import ErrorBoundary from './components/ErrorBoundary';

// ─── Config ─────────────────────────────────────────────────────
const extraApiOrigin =
  (Constants.expoConfig?.extra as any)?.apiOrigin ||
  (Constants.manifest2 as any)?.extra?.expoClient?.extra?.apiOrigin;
const API_ORIGIN = __DEV__
  ? Platform.select({ android: 'http://10.0.2.2:3000', default: 'http://localhost:3000' })
  : (extraApiOrigin || 'https://profitforce.vercel.app');

const Tab = createBottomTabNavigator();

// ─── API Helper ─────────────────────────────────────────────────
async function api(path: string, options: any = {}) {
  const jwt = await SecureStore.getItemAsync('profitforce_jwt');
  const headers: any = { 'Content-Type': 'application/json', ...options.headers };
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  return axios({ url: `${API_ORIGIN}${path}`, ...options, headers });
}

// ─── Auth Context ───────────────────────────────────────────────
function useAuth() {
  const [jwt, setJwt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync('profitforce_jwt').then(t => { setJwt(t); setLoading(false); });
  }, []);

  const login = async (token: string) => {
    await SecureStore.setItemAsync('profitforce_jwt', token);
    setJwt(token);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('profitforce_jwt');
    setJwt(null);
  };

  return { jwt, loading, login, logout, isLoggedIn: !!jwt };
}

// ─── Deep Link Handler ──────────────────────────────────────────
function useDeepLink(onToken: (jwt: string) => void) {
  useEffect(() => {
    async function handle(url: string) {
      try {
        const u = new URL(url);
        const token = u.searchParams.get('token');
        if (!token) return;
        const res = await fetch(`${API_ORIGIN}/api/auth/exchange-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (res.ok && json.token) onToken(json.token);
      } catch { /* ignore */ }
    }

    Linking.getInitialURL().then(u => { if (u) handle(u); });
    const sub = Linking.addEventListener('url', e => handle(e.url));
    return () => sub.remove();
  }, [onToken]);
}

// ═══════════════════════════════════════════════════════════════════
// SCREENS
// ═══════════════════════════════════════════════════════════════════

// ── Dashboard Screen ────────────────────────────────────────────
function DashboardScreen() {
  const [indices, setIndices] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [idxRes, sigRes] = await Promise.all([
        api('/api/indices'),
        api('/api/scan'),
      ]);
      setIndices(idxRes.data?.indices ?? idxRes.data?.data ?? []);
      setSignals(sigRes.data?.all ?? sigRes.data?.results ?? []);
    } catch (e) {
      console.warn('fetch failed', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 45s
  useEffect(() => {
    const id = setInterval(fetchData, 45000);
    return () => clearInterval(id);
  }, [fetchData]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#10b981" /></View>;

  return (
    <ScrollView
      style={s.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor="#10b981" />}
    >
      <Text style={s.h1}>Market Overview</Text>

      {/* Index Cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        {indices.map((idx: any, i: number) => {
          const up = (idx.change ?? 0) >= 0;
          return (
            <View key={i} style={[s.indexCard, up ? s.greenBorder : s.redBorder]}>
              <Text style={s.indexName}>{idx.name ?? idx.sym}</Text>
              <Text style={[s.indexPrice, up ? s.green : s.red]}>
                {idx.price != null ? Number(idx.price).toFixed(2) : '—'}
              </Text>
              <Text style={[s.indexChange, up ? s.green : s.red]}>
                {up ? '▲' : '▼'} {idx.change != null ? `${Number(idx.change).toFixed(2)}%` : ''}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Signals */}
      <Text style={s.h2}>Signals</Text>
      {signals.map((sig: any, i: number) => {
        const action = String(sig.signal ?? '').toUpperCase();
        const isBuy = action === 'BUY';
        const isSell = action === 'SELL';
        return (
          <View key={i} style={s.signalCard}>
            <View style={s.signalRow}>
              <View>
                <Text style={s.signalSymbol}>{sig.symbol}</Text>
                <Text style={s.signalName}>{sig.name ?? ''}</Text>
              </View>
              <View style={[s.badge, isBuy ? s.buyBadge : isSell ? s.sellBadge : s.holdBadge]}>
                <Text style={s.badgeText}>{action || 'HOLD'}</Text>
              </View>
            </View>
            <View style={s.signalDetails}>
              <Text style={s.detailText}>Entry: {sig.entryPrice ?? '—'}</Text>
              <Text style={s.detailText}>Stop: {sig.stopLoss ?? '—'}</Text>
              <Text style={s.detailText}>Target: {sig.targetPrice ?? '—'}</Text>
            </View>
            {sig.strength != null && (
              <View style={s.strengthBar}>
                <View style={[s.strengthFill, { width: `${Math.min(100, sig.strength)}%` }, isBuy ? s.greenBg : isSell ? s.redBg : s.grayBg]} />
              </View>
            )}
          </View>
        );
      })}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Predict Screen ──────────────────────────────────────────────
function PredictScreen() {
  const [symbol, setSymbol] = useState('INFY.NS');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const predict = async () => {
    setLoading(true);
    try {
      const res = await api(`/api/predict/ensemble?symbol=${encodeURIComponent(symbol)}`);
      setResult(res.data);
    } catch (e: any) {
      setResult({ error: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={s.screen}>
      <Text style={s.h1}>AI Prediction</Text>
      <TextInput
        style={s.input}
        value={symbol}
        onChangeText={setSymbol}
        placeholder="Symbol (e.g. INFY.NS)"
        placeholderTextColor="#666"
        autoCapitalize="characters"
      />
      <TouchableOpacity style={s.primaryBtn} onPress={predict} disabled={loading}>
        <Text style={s.primaryBtnText}>{loading ? 'Predicting…' : 'Get Prediction'}</Text>
      </TouchableOpacity>

      {result && !result.error && (
        <View style={s.resultCard}>
          <View style={s.signalRow}>
            <Text style={s.h2}>{result.symbol ?? symbol}</Text>
            <View style={[s.badge, result.signal === 'BUY' ? s.buyBadge : result.signal === 'SELL' ? s.sellBadge : s.holdBadge]}>
              <Text style={s.badgeText}>{result.signal}</Text>
            </View>
          </View>
          <Text style={s.detailText}>Confidence: {((result.confidence ?? 0) * 100).toFixed(1)}%</Text>
          <Text style={s.detailText}>Entry: {result.entry ?? '—'}</Text>
          <Text style={s.detailText}>Stop: {result.stop ?? '—'}</Text>
          <Text style={s.detailText}>Target: {result.target ?? '—'}</Text>
          <Text style={[s.detailText, { marginTop: 8, color: '#888' }]}>Source: {result.source ?? 'n/a'}</Text>
        </View>
      )}
      {result?.error && (
        <View style={[s.resultCard, s.redBorder]}>
          <Text style={s.red}>Error: {result.error}</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Watchlist Screen ────────────────────────────────────────────
function WatchlistScreen() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [newSymbol, setNewSymbol] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await api('/api/watchlist');
      setSymbols(res.data?.symbols ?? []);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchWatchlist(); }, [fetchWatchlist]);

  const addSymbol = async () => {
    if (!newSymbol.trim()) return;
    try {
      const res = await api('/api/watchlist', { method: 'POST', data: { symbol: newSymbol.trim() } });
      setSymbols(res.data?.symbols ?? []);
      setNewSymbol('');
    } catch { /* empty */ }
  };

  const removeSymbol = async (sym: string) => {
    try {
      const res = await api('/api/watchlist', { method: 'DELETE', data: { symbol: sym } });
      setSymbols(res.data?.symbols ?? []);
    } catch { /* empty */ }
  };

  return (
    <ScrollView style={s.screen}>
      <Text style={s.h1}>Watchlist</Text>
      <View style={s.addRow}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          value={newSymbol}
          onChangeText={setNewSymbol}
          placeholder="Add symbol…"
          placeholderTextColor="#666"
          autoCapitalize="characters"
        />
        <TouchableOpacity style={[s.primaryBtn, { marginLeft: 8, paddingHorizontal: 16 }]} onPress={addSymbol}>
          <Text style={s.primaryBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color="#10b981" style={{ marginTop: 24 }} />
      ) : symbols.length === 0 ? (
        <Text style={s.muted}>No symbols in watchlist</Text>
      ) : (
        symbols.map((sym, i) => (
          <View key={i} style={s.watchRow}>
            <Text style={s.watchSymbol}>{sym}</Text>
            <TouchableOpacity onPress={() => removeSymbol(sym)}>
              <Text style={s.red}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ── Profile Screen ──────────────────────────────────────────────
function ProfileScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <View style={[s.screen, s.center]}>
      <Text style={s.h1}>Profile</Text>
      <TouchableOpacity
        style={[s.primaryBtn, { marginTop: 16 }]}
        onPress={() => Linking.openURL(`${API_ORIGIN}/dashboard`)}
      >
        <Text style={s.primaryBtnText}>Open Web Dashboard</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.primaryBtn, { marginTop: 12, backgroundColor: '#ef4444' }]}
        onPress={onLogout}
      >
        <Text style={s.primaryBtnText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Login Screen ────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (jwt: string) => void }) {
  useDeepLink(onLogin);

  return (
    <View style={[s.screen, s.center]}>
      <Text style={s.logo}>� ProfitForce</Text>
      <Text style={[s.muted, { marginBottom: 24 }]}>Sign in via the web to continue</Text>
      <TouchableOpacity
        style={s.primaryBtn}
        onPress={() => Linking.openURL(`${API_ORIGIN}/auth/transfer`)}
      >
        <Text style={s.primaryBtnText}>Sign In</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.primaryBtn, { marginTop: 12, backgroundColor: '#334155' }]}
        onPress={() => Linking.openURL(`${API_ORIGIN}/sign-up`)}
      >
        <Text style={s.primaryBtnText}>Create Account</Text>
      </TouchableOpacity>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════════
function AppInner() {
  const { jwt, loading, login, logout, isLoggedIn } = useAuth();
  useDeepLink(login);

  if (loading) {
    return <View style={[s.screen, s.center]}><ActivityIndicator size="large" color="#10b981" /></View>;
  }

  if (!isLoggedIn) {
    return <LoginScreen onLogin={login} />;
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#0a0f1c' },
          headerTintColor: '#fff',
          tabBarStyle: { backgroundColor: '#0a0f1c', borderTopColor: '#1e293b' },
          tabBarActiveTintColor: '#10b981',
          tabBarInactiveTintColor: '#94a3b8',
        }}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarLabel: 'Home' }} />
        <Tab.Screen name="Predict" component={PredictScreen} options={{ tabBarLabel: 'AI' }} />
        <Tab.Screen name="Watchlist" component={WatchlistScreen} />
        <Tab.Screen name="Profile">
          {() => <ProfileScreen onLogout={logout} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0f1c', padding: 16 },
  center: { alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  h2: { fontSize: 18, fontWeight: '600', color: '#fff', marginBottom: 8 },
  muted: { color: '#94a3b8', fontSize: 14 },
  logo: { fontSize: 36, fontWeight: 'bold', color: '#10b981', marginBottom: 8 },

  // Index cards
  indexCard: { width: 140, padding: 12, borderRadius: 12, borderWidth: 1, marginRight: 10 },
  indexName: { fontSize: 11, color: '#94a3b8', marginBottom: 4 },
  indexPrice: { fontSize: 18, fontWeight: 'bold' },
  indexChange: { fontSize: 13, marginTop: 2 },

  // Signal cards
  signalCard: { backgroundColor: '#111827', borderRadius: 12, padding: 14, marginBottom: 10 },
  signalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  signalSymbol: { fontSize: 16, fontWeight: '600', color: '#fff' },
  signalName: { fontSize: 12, color: '#94a3b8' },
  signalDetails: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  detailText: { fontSize: 13, color: '#cbd5e1' },

  // Badges
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  buyBadge: { backgroundColor: '#10b981' },
  sellBadge: { backgroundColor: '#ef4444' },
  holdBadge: { backgroundColor: '#6b7280' },
  badgeText: { color: '#000', fontWeight: '700', fontSize: 12 },

  // Strength bar
  strengthBar: { height: 4, borderRadius: 2, backgroundColor: '#1e293b', marginTop: 8 },
  strengthFill: { height: 4, borderRadius: 2 },

  // Inputs/Buttons
  input: { borderWidth: 1, borderColor: '#334155', borderRadius: 8, padding: 12, color: '#fff', backgroundColor: '#111827', fontSize: 16 },
  primaryBtn: { backgroundColor: '#10b981', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' },
  primaryBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },

  // Result card
  resultCard: { backgroundColor: '#111827', borderRadius: 12, padding: 16, marginTop: 16 },

  // Watchlist
  addRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  watchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  watchSymbol: { fontSize: 16, color: '#fff', fontWeight: '500' },

  // Colors
  green: { color: '#10b981' },
  red: { color: '#ef4444' },
  greenBorder: { borderColor: '#10b981' },
  redBorder: { borderColor: '#ef4444' },
  greenBg: { backgroundColor: '#10b981' },
  redBg: { backgroundColor: '#ef4444' },
  grayBg: { backgroundColor: '#6b7280' },
});
