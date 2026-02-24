import type { DeliveryInfo } from '@/types/api';

/**
 * Allowed next delivery status codes from current status.
 * Matches backend: received -> preparing -> prepared -> out_for_delivery -> delivered.
 * Cancelled allowed from any non-final state.
 */
const TRANSITIONS: Record<string, string[]> = {
  received: ['preparing', 'cancelled'],
  preparing: ['prepared', 'cancelled'],
  prepared: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

import { DELIVERY_STATUS_LABEL_MN, deliveryStatusLabelMn as labelMn } from '@/constants/deliveryStatusLabels';

/** Mongolian labels for delivery status codes (UI only). Re-export from constants. */
export const DELIVERY_STATUS_LABELS = DELIVERY_STATUS_LABEL_MN;

/** Badge background color by delivery status code (list + detail). */
export const DELIVERY_STATUS_BADGE_COLORS: Record<string, string> = {
  received: '#6b7280',
  preparing: '#d97706',
  prepared: '#7c3aed',
  out_for_delivery: '#2563eb',
  delivered: '#15803d',
  cancelled: '#6b7280',
};

/** Order of stages for stepper (received → … → delivered). Cancelled is not a step. */
export const DELIVERY_STEPPER_CODES = ['received', 'preparing', 'prepared', 'out_for_delivery', 'delivered'] as const;

export function getStatusLabel(code: string | undefined): string {
  if (!code) return '';
  return labelMn(code) || code;
}

/** Display label: prefer backend label, fallback to local Mongolian map. Never show raw code. */
export function getDisplayLabel(backendLabel: string | undefined, code: string | undefined): string {
  const trimmed = backendLabel?.trim();
  if (trimmed) return trimmed;
  return getStatusLabel(code) || '';
}

export function getBadgeColor(code: string | undefined): string {
  if (!code) return '#6b7280';
  return DELIVERY_STATUS_BADGE_COLORS[code] ?? '#6b7280';
}

/** Index 0..4 for stepper; -1 for cancelled or unknown. */
export function getStepperIndex(code: string | undefined): number {
  if (!code || code === 'cancelled') return -1;
  const i = DELIVERY_STEPPER_CODES.indexOf(code as (typeof DELIVERY_STEPPER_CODES)[number]);
  return i >= 0 ? i : -1;
}

export function getAllowedNextStatusCodes(currentCode: string | undefined): string[] {
  if (!currentCode) return [];
  const next = TRANSITIONS[currentCode];
  return next ?? [];
}

export function getCurrentStatusCode(delivery: DeliveryInfo | null): string | undefined {
  return delivery?.current_status?.code ?? delivery?.status;
}

export function requiresConfirmation(statusCode: string): boolean {
  return statusCode === 'cancelled' || statusCode === 'delivered';
}
