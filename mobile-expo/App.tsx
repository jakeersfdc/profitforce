import React, { useState, useEffect } from 'react';
import { View, Text, Button, TextInput, StyleSheet, Linking } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export default function App() {
  const [symbol, setSymbol] = useState('INFY.NS');
  const [result, setResult] = useState<any>(null);

  async function callPredict() {
    try {
      const jwt = await SecureStore.getItemAsync('bullforce_jwt');
      const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000';
      const res = await axios.get(`${origin}/api/predict/ensemble?symbol=${encodeURIComponent(symbol)}`, {
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
      });
      setResult(res.data);
    } catch (e: any) {
      setResult({ error: String(e?.message || e) });
    }
  }

  function openWebLogin() {
    const url = `${process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000'}/sign-in`;
    Linking.openURL(url).catch(e => console.warn('open url failed', e));
  }

  function openCheckout() {
    // Opens web checkout; replace priceId as needed
    const url = `${process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000'}/checkout`;
    Linking.openURL(url).catch(e => console.warn('open url failed', e));
  }

  async function handleDeepLinkUrl(url: string) {
    try {
      const u = new URL(url);
      const token = u.searchParams.get('token');
      if (!token) return;
      // Exchange token for JWT
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000'}/api/auth/exchange-token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'exchange failed');
      // store jwt securely
      console.log('Received jwt for mobile:', json.token);
      await SecureStore.setItemAsync('bullforce_jwt', json.token);
      setResult({ jwt: json.token, clerk_id: json.clerk_id });
    } catch (e) {
      console.warn('deep link exchange failed', e);
    }
  }

  useEffect(() => {
    // on mount, check initial URL and listen for deep links
    (async () => {
      const initial = await Linking.getInitialURL();
      if (initial) handleDeepLinkUrl(initial);
    })();
    const sub = Linking.addEventListener('url', (evt: any) => handleDeepLinkUrl(evt.url));
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bullforce Mobile (scaffold)</Text>
      <TextInput style={styles.input} value={symbol} onChangeText={setSymbol} />
      <Button title="Call Predict Ensemble" onPress={callPredict} />
      <View style={{ height: 12 }} />
      <Button title="Open Web Sign-In" onPress={openWebLogin} />
      <View style={{ height: 8 }} />
      <Button title="Open Checkout (web)" onPress={openCheckout} />
      <View style={{ marginTop: 16 }}>
        <Text>Result:</Text>
        <Text>{JSON.stringify(result, null, 2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontSize: 20, marginBottom: 12 },
  input: { width: '100%', borderWidth: 1, padding: 8, marginBottom: 12 }
});
