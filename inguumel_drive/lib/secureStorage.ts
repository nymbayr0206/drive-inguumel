import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const FALLBACK_PREFIX = '@inguumel_drive_secure_';

async function getItemSecure(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(FALLBACK_PREFIX + key);
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return AsyncStorage.getItem(FALLBACK_PREFIX + key);
  }
}

async function setItemSecure(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(FALLBACK_PREFIX + key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    await AsyncStorage.setItem(FALLBACK_PREFIX + key, value);
  }
}

async function removeItemSecure(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(FALLBACK_PREFIX + key);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* no-op */
  }
  await AsyncStorage.removeItem(FALLBACK_PREFIX + key);
}

export const secureStorage = {
  getItem: getItemSecure,
  setItem: setItemSecure,
  removeItem: removeItemSecure,
};
