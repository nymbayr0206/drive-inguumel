import { config } from '@/config/env';

const normalizedBaseUrl = config.apiBaseUrl.replace(/\/$/, '');

export const legal = {
  privacyPolicyUrl: `${normalizedBaseUrl}/legal/privacy-policy`,
  termsUrl: `${normalizedBaseUrl}/legal/terms`,
};
