import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AppSettings, DEFAULT_SETTINGS } from '../types';

const SETTINGS_KEY = 'satsvoucher:settings';

// These fields are stored in SecureStore, everything else in AsyncStorage
const SECURE_FIELDS: (keyof AppSettings)[] = [
  'blinkApiKey',
  'blinkWalletId',
  'workerSecret',
  'settingsPin',
];

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const stored: Partial<AppSettings> = raw ? JSON.parse(raw) : {};

    // Overlay secure fields
    const secure: Partial<AppSettings> = {};
    for (const field of SECURE_FIELDS) {
      const val = await SecureStore.getItemAsync(`satsvoucher:${field}`);
      if (val !== null) (secure as any)[field] = val;
    }

    return { ...DEFAULT_SETTINGS, ...stored, ...secure };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  // Split into secure vs plain
  const plain: Partial<AppSettings> = { ...settings };
  for (const field of SECURE_FIELDS) {
    const val = settings[field];
    await SecureStore.setItemAsync(`satsvoucher:${field}`, String(val ?? ''));
    delete plain[field];
  }
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(plain));
}

export function isConfigured(settings: AppSettings): boolean {
  return (
    settings.workerUrl.trim() !== '' &&
    settings.workerSecret.trim() !== '' &&
    settings.blinkApiKey.trim() !== '' &&
    settings.blinkWalletId.trim() !== ''
  );
}
