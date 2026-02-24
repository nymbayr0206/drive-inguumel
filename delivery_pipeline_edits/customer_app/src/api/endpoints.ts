/**
 * Customer app — createOrder and getMxmOrders.
 * Success only when HTTP 2xx AND response contains order_id (or data.id / order_number).
 * On malformed 2xx return { ambiguousSuccess: true } so UI can run fallback.
 */

import { apiClient } from './client'; // your axios/fetch client

const MXM_ORDERS = '/api/v1/mxm/orders';

export interface CreateOrderResult {
  orderId: string | number;
  orderNumber: string;
}

export interface CreateOrderAmbiguous {
  ambiguousSuccess: true;
}

export async function createOrder(payload: Record<string, unknown>): Promise<CreateOrderResult | CreateOrderAmbiguous> {
  const response = await apiClient.post(MXM_ORDERS, payload);
  const status = response.status;
  const data = response.data;

  if (status < 200 || status >= 300) {
    throw new Error(data?.message || 'Алдаа гарлаа. Дахин оролдоно уу.');
  }

  const inner = data?.data ?? data;
  const orderId = inner?.order_id ?? inner?.id;
  const orderNumber = inner?.order_number ?? inner?.name ?? (orderId != null ? String(orderId) : '');

  if (orderId != null && orderNumber !== undefined) {
    return { orderId: String(orderId), orderNumber: String(orderNumber) };
  }
  if (orderId != null) {
    return { orderId: String(orderId), orderNumber: String(orderId) };
  }

  console.warn('[createOrder] 2xx but malformed response', { status, data });
  return { ambiguousSuccess: true };
}

export interface MxmOrderListItem {
  order_id?: string | number;
  id?: string | number;
  order_number?: string;
  date_order?: string;
  delivery_status_code?: string;
  amount_total?: number;
  partner_phone?: string;
  [key: string]: unknown;
}

export async function getMxmOrders(
  warehouseId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<MxmOrderListItem[]> {
  const { limit = 10, offset = 0 } = options;
  const { data } = await apiClient.get(MXM_ORDERS, {
    params: { warehouse_id: warehouseId, limit, offset },
  });
  const list = data?.data ?? data?.results ?? data?.orders ?? data;
  return Array.isArray(list) ? list : [];
}
