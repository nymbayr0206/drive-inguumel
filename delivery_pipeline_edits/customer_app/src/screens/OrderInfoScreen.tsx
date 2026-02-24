/**
 * Customer app — checkout submit: "Захиалга баталгаажуулах".
 * 1) Disable button + show loading.
 * 2) Call createOrder.
 * 3) On success with orderId: success banner, resetCart(), refresh cart, navigate to order detail.
 * 4) On ambiguousSuccess or error: fallback getMxmOrders (newest within 2 min, match phone/amount); if found treat as success and clear cart; else show Mongolian error and DO NOT clear cart.
 * 5) Instrumentation logs (console + optional Sentry).
 */

import { useCallback, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { createOrder, getMxmOrders, type MxmOrderListItem } from '../api/endpoints';
import { normalizeApiError } from '../utils/errors';

const SUCCESS_MSG = 'Захиалга амжилттай боллоо.';
const ERR_TITLE = 'Алдаа';
const FALLBACK_WINDOW_MS = 2 * 60 * 1000;

function isSuccess(
  result: { orderId: string | number; orderNumber: string } | { ambiguousSuccess: true }
): result is { orderId: string | number; orderNumber: string } {
  return 'orderId' in result && !('ambiguousSuccess' in result);
}

export function useOrderSubmit(
  warehouseId: string,
  resetCart: () => void,
  refreshCart: () => Promise<void>,
  navigateToOrder: (orderId: string) => void
) {
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (payload: Record<string, unknown>) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        const result = await createOrder(payload);
        if (isSuccess(result)) {
          console.log('[OrderInfo] createOrder success', { orderId: result.orderId, orderNumber: result.orderNumber });
          resetCart();
          await refreshCart();
          navigateToOrder(String(result.orderId));
          Alert.alert('', SUCCESS_MSG);
          return;
        }
        console.warn('[OrderInfo] ambiguousSuccess, running fallback');
        const recent = await getMxmOrders(warehouseId, { limit: 3, offset: 0 });
        const since = Date.now() - FALLBACK_WINDOW_MS;
        const phone = (payload.partner_phone ?? payload.phone ?? '') as string;
        const amount = (payload.amount_total ?? payload.total ?? 0) as number;
        const match = recent.find((o: MxmOrderListItem) => {
          const orderTime = o.date_order ? new Date(o.date_order).getTime() : 0;
          if (orderTime < since) return false;
          if (phone && (o.partner_phone ?? (o as Record<string, unknown>).phone) !== phone) return false;
          if (amount != null && amount > 0 && Number(o.amount_total) !== amount) return false;
          return true;
        });
        if (match) {
          const orderId = String(match.order_id ?? match.id);
          console.log('[OrderInfo] fallback matched order', orderId);
          resetCart();
          await refreshCart();
          navigateToOrder(orderId);
          Alert.alert('', SUCCESS_MSG);
          return;
        }
        Alert.alert(ERR_TITLE, normalizeApiError(new Error('Ambiguous')).message);
      } catch (err) {
        const { message } = normalizeApiError(err);
        console.error('[OrderInfo] submit error', err);
        Alert.alert(ERR_TITLE, message);
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, warehouseId, resetCart, refreshCart, navigateToOrder]
  );

  return { submit, submitting };
}

// Usage in your OrderInfoScreen component:
// const { submit, submitting } = useOrderSubmit(warehouseId, resetCart, refreshCart, (id) => navigation.navigate('OrderDetail', { id }));
// <Button title="Захиалга баталгаажуулах" onPress={() => submit(formPayload)} disabled={submitting} />
// {submitting && <ActivityIndicator /> }
