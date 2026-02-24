import type { Order } from '@/types/api';
import type { DeliveryInfo, DeliverySnapshot } from '@/types/api';

const LABEL_PAID = 'Төлөгдсөн';
const LABEL_UNPAID = 'Төлөгдөөгүй';

function isCodOrder(order: Order | null | undefined, delivery?: DeliveryInfo | DeliverySnapshot | null): boolean {
  const method = (order?.payment_method ?? order?.payment_method_code ?? delivery?.payment_method ?? '')
    .toString()
    .toLowerCase();
  return method === 'cod';
}

/** Order may have status_history from API (timeline with code). */
function orderStatusHistoryHasCodConfirmed(order: Order | null | undefined): boolean {
  const hist = (order as { status_history?: { code?: string }[] })?.status_history;
  return Array.isArray(hist) && hist.some((x) => (x?.code ?? '').toLowerCase() === 'cod_confirmed');
}

/**
 * Unified payment label for list and detail.
 * COD: confirmed if delivery.cod_confirmed | delivery.cod_confirmed_at | order.status_history has cod_confirmed | order.payment.payment_status===paid | order.payment.paid.
 * Non-COD: order.is_paid / payment_state_code === 'paid'.
 */
export function paymentLabel(
  order: Order | null | undefined,
  delivery?: DeliveryInfo | DeliverySnapshot | null
): string {
  if (__DEV__ && order) {
    const method = (order as Order).payment_method ?? (order as Order & { payment_method_code?: string }).payment_method_code ?? ((order as { payment?: { payment_method?: string } }).payment?.payment_method ?? '');
    if (String(method).toLowerCase() === 'cod') {
      const pay = typeof order === 'object' && 'payment' in order ? (order as { payment?: { payment_status?: string; paid?: boolean } }).payment : undefined;
      console.log('[PAYLABEL INPUT]', {
        id: order.order_id ?? (order as Order).id,
        method,
        status_history_has_cod_confirmed: orderStatusHistoryHasCodConfirmed(order),
        delivery_cod_confirmed: delivery && typeof delivery === 'object' && 'cod_confirmed' in delivery ? (delivery as { cod_confirmed?: boolean }).cod_confirmed : undefined,
        delivery_cod_confirmed_at: delivery && typeof delivery === 'object' && 'cod_confirmed_at' in delivery ? (delivery as { cod_confirmed_at?: string }).cod_confirmed_at : undefined,
        order_payment_status: pay?.payment_status,
        order_paid: pay?.paid,
        payment_state_code: (order as Order).payment_state_code,
        is_paid: (order as Order).is_paid,
      });
    }
  }
  if (!order) return LABEL_UNPAID;
  if (isCodOrder(order, delivery)) {
    const cod = delivery ?? order;
    if ((cod as { cod_confirmed?: boolean }).cod_confirmed === true) return LABEL_PAID;
    const codAt = (cod as { cod_confirmed_at?: string | null }).cod_confirmed_at;
    if (codAt != null && String(codAt).trim() !== '') return LABEL_PAID;
    if (orderStatusHistoryHasCodConfirmed(order)) return LABEL_PAID;
    const pay = (order as { payment?: { payment_status?: string; paid?: boolean } }).payment;
    if ((pay?.payment_status ?? '').toString().toLowerCase() === 'paid' || pay?.paid === true) return LABEL_PAID;
    return LABEL_UNPAID;
  }
  if (order.is_paid === true) return LABEL_PAID;
  const code = (order.payment_state_code ?? '').toString().toLowerCase();
  if (code === 'paid') return LABEL_PAID;
  return LABEL_UNPAID;
}
