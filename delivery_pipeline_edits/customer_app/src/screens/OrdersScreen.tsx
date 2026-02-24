/**
 * Customer app — Orders list: tabs by delivery_status_code, badge colors, progress dots.
 * - Tabs: Бүгд | Идэвхтэй | Хүргэгдсэн | Цуцлагдсан
 * - Filter ONLY by delivery_status_code from order (no N+1; backend must return it).
 * - Badge: delivered=green, cancelled=gray, out_for_delivery=blue, prepared=purple, preparing=amber.
 * - Progress dots: received(0), preparing(1), prepared(2), out_for_delivery(3), delivered(4); cancelled = gray + X.
 */

const DELIVERY_CODES = [
  'received',
  'preparing',
  'prepared',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;

export const TAB_KEYS = {
  ALL: 'all',
  ACTIVE: 'active',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const;

export function isOrderInTab(
  deliveryStatusCode: string | undefined,
  tab: string
): boolean {
  const code = (deliveryStatusCode ?? '').trim().toLowerCase();
  if (tab === TAB_KEYS.ALL) return true;
  if (tab === TAB_KEYS.ACTIVE) return !['delivered', 'cancelled'].includes(code);
  if (tab === TAB_KEYS.DELIVERED) return code === 'delivered';
  if (tab === TAB_KEYS.CANCELLED) return code === 'cancelled';
  return true;
}

export const BADGE_COLORS: Record<string, string> = {
  delivered: '#15803d',
  cancelled: '#6b7280',
  out_for_delivery: '#2563eb',
  prepared: '#7c3aed',
  preparing: '#d97706',
  received: '#6b7280',
};

const STEPPER_CODES = ['received', 'preparing', 'prepared', 'out_for_delivery', 'delivered'] as const;

export function getProgressStepIndex(code: string | undefined): number {
  if (!code || code === 'cancelled') return -1;
  const i = STEPPER_CODES.indexOf(code as (typeof STEPPER_CODES)[number]);
  return i >= 0 ? i : -1;
}

export function isCancelled(code: string | undefined): boolean {
  return (code ?? '').toLowerCase() === 'cancelled';
}

// In your list item component:
// - Use order.delivery_status_code from the list response (no extra fetch).
// - Badge color: BADGE_COLORS[order.delivery_status_code] ?? '#6b7280'
// - Progress: if isCancelled(code) show gray dots + X; else show 5 dots with completed up to getProgressStepIndex(code); if delivered all green.
