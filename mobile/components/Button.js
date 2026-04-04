import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function Button({ children, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.button}>
      <Text style={styles.text}>{children}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: '#06b6d4', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  text: { color: '#02111a', fontWeight: '600' }
});
