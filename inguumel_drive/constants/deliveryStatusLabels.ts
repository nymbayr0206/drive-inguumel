/**
 * Mongolian labels for delivery status codes.
 * Prefer API delivery.current_status.label; use this map only as fallback.
 * Never show snake_case in UI.
 */

export const DELIVERY_STATUS_LABEL_MN: Record<string, string> = {
  received: 'Захиалга авлаа',
  preparing: 'Бэлтгэж байна',
  prepared: 'Бэлтгэж дууссан',
  out_for_delivery: 'Хүргэлтэд гарсан',
  delivered: 'Хүргэгдсэн',
  cancelled: 'Цуцлагдсан',
};

/** Badge/UI colors by delivery status. Single source for list + detail. */
export const DELIVERY_STATUS_COLOR: Record<string, string> = {
  received: '#6b7280',
  preparing: '#d97706',
  prepared: '#7c3aed',
  out_for_delivery: '#2563eb',
  delivered: '#15803d',
  cancelled: '#6b7280',
};

export function deliveryStatusLabelMn(code: string | undefined): string {
  if (!code) return '';
  return DELIVERY_STATUS_LABEL_MN[code] ?? '';
}

/** Button label for action (e.g. "Цуцлах" for cancel action instead of status "Цуцлагдсан"). */
export function deliveryActionButtonLabelMn(code: string | undefined): string {
  if (!code) return '';
  if (code === 'cancelled') return 'Цуцлах';
  return DELIVERY_STATUS_LABEL_MN[code] ?? code;
}
