const { expo } = require('./app.json');

const baseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  process.env.API_BASE_URL ??
  expo.extra?.apiBaseUrl ??
  'http://72.62.247.95:8069';
const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
const env =
  process.env.EXPO_PUBLIC_ENV ??
  process.env.NODE_ENV ??
  expo.extra?.env ??
  'development';
const appContext =
  process.env.EXPO_PUBLIC_APP_CONTEXT ??
  expo.extra?.appContext ??
  'driver';
const privacyPolicyUrl =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ??
  expo.extra?.privacyPolicyUrl ??
  `${normalizedBaseUrl}/legal/privacy-policy`;
const termsUrl =
  process.env.EXPO_PUBLIC_TERMS_URL ??
  expo.extra?.termsUrl ??
  `${normalizedBaseUrl}/legal/terms`;

module.exports = {
  expo: {
    ...expo,
    extra: {
      ...expo.extra,
      apiBaseUrl: baseUrl,
      env,
      appContext,
      privacyPolicyUrl,
      termsUrl,
    },
  },
};
