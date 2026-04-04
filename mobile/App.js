import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Linking, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import MobileButton from './components/Button';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  useEffect(() => {
    // Placeholder: register for push notifications here (Firebase / OneSignal)
    // e.g., request permissions and obtain token
    // For now show a notice
    console.log('Mobile app started — implement push registration');
  }, []);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bullforce Mobile (scaffold)</Text>
      <Text style={styles.subtitle}>This is a starter Expo app. Connect it to your API endpoints.</Text>
      <MobileButton onPress={() => Linking.openURL('https://your-vercel-app.vercel.app/dashboard')}>Open Dashboard</MobileButton>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16, textAlign: 'center' }
});

