import Constants from 'expo-constants';

/**
 * API base URL. Prod and local per spec.
 * Override with EXPO_PUBLIC_API_BASE_URL in .env if needed.
 */
const PROD = 'http://72.62.247.95:8069';
const LOCAL = 'http://127.0.0.1:8069';
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

const API_BASE_URL =
  (
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    extra.apiBaseUrl ??
    PROD
  ).replace(/\/$/, '');

/** App context for login X-App header: driver | cashier. Driver app uses "driver". */
export const APP_CONTEXT =
  ((process.env.EXPO_PUBLIC_APP_CONTEXT ??
    extra.appContext) as 'driver' | 'cashier') ?? 'driver';

export const config = {
  apiBaseUrl: API_BASE_URL,
  isLocal: API_BASE_URL === LOCAL,
  appContext: APP_CONTEXT,
} as const;
