/**
 * API base URL. Prod and local per spec.
 * Override with EXPO_PUBLIC_API_BASE_URL in .env if needed.
 */
const PROD = 'http://72.62.247.95:8069';
const LOCAL = 'http://localhost:8069';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? PROD;

/** App context for login X-App header: driver | cashier. Driver app uses "driver". */
export const APP_CONTEXT =
  (process.env.EXPO_PUBLIC_APP_CONTEXT as 'driver' | 'cashier') ?? 'driver';

export const config = {
  apiBaseUrl: API_BASE_URL,
  isLocal: API_BASE_URL === LOCAL,
  appContext: APP_CONTEXT,
} as const;
