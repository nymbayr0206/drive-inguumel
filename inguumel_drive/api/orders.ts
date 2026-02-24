import type {
  Order,
  OrderDetail,
  DeliveryInfo,
  DeliveryStatusPayload,
} from '@/types/api';
import { config } from '@/config/env';
import client from './client';
import { API_PATHS } from './paths';

export interface OrdersListResponse {
  results?: Order[];
  data?: Order[];
  orders?: Order[];
}

function extractOrders(data: unknown): Order[] {
  if (Array.isArray(data)) return data as Order[];
  if (data && typeof data === 'object') {
    const o = data as OrdersListResponse;
    if (Array.isArray(o.results)) return o.results;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.orders)) return o.orders;
  }
  return [];
}

/** GET /api/v1/mxm/orders?limit=&offset= (optional warehouse_id=) */
export async function fetchOrders(
  limit = 20,
  offset = 0,
  warehouseId?: string | null
): Promise<Order[]> {
  const params: { limit: number; offset: number; warehouse_id?: string } = {
    limit,
    offset,
  };
  if (warehouseId) params.warehouse_id = warehouseId;
  const { data } = await client.get<unknown>(API_PATHS.MXM_ORDERS, { params });
  return extractOrders(data);
}

/** GET /api/v1/drive/orders?warehouse_id=&status=&limit=&offset= — driver list with delivery_status_code */
export async function fetchDriveOrders(
  warehouseId: string,
  options: { status?: string; limit?: number; offset?: number } = {}
): Promise<Order[]> {
  const { status, limit = 20, offset = 0 } = options;
  const params: Record<string, string | number> = {
    warehouse_id: warehouseId,
    limit,
    offset,
  };
  if (status) params.status = status;
  try {
    if (__DEV__) {
      const baseUrl = config.apiBaseUrl.replace(/\/$/, '');
      const query = new URLSearchParams(
        Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
      ).toString();
      const endpointUrl = `${baseUrl}${API_PATHS.DRIVE_ORDERS}${query ? `?${query}` : ''}`;
      console.log('[fetchDriveOrders] endpoint', endpointUrl);
      console.log('[fetchDriveOrders] params', JSON.stringify(params));
    }
    const { data } = await client.get<unknown>(API_PATHS.DRIVE_ORDERS, { params });
    const list = extractOrders(data);
    if (__DEV__) {
      const withCode = list.filter((o) => (o.delivery_status_code ?? '').trim().length > 0).length;
      console.log('[fetchDriveOrders]', { count: list.length, withDeliveryStatusCode: withCode });
      const head = list.slice(0, 3).map((o) => ({
        id: o.order_id ?? o.id,
        order_number: o.order_number ?? (o as Order & { name?: string }).name,
        state: o.state,
        delivery_status_code: o.delivery_status_code,
        delivery_status_label: o.delivery_status_label,
        delivery_status_label_mn: (o as Order & { delivery_status_label_mn?: string }).delivery_status_label_mn,
        warehouse_id: (o as Order & { warehouse_id?: string | number }).warehouse_id,
      }));
      console.log('[fetchDriveOrders] first 3 items', JSON.stringify(head, null, 0));
    }
    return list;
  } catch (e) {
    if (__DEV__) console.warn('[fetchDriveOrders] fallback to mxm/orders', e);
    return fetchOrders(limit, offset, warehouseId);
  }
}

function unwrapData<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'success' in raw && 'data' in raw) {
    const envelope = raw as { success?: boolean; data?: T };
    if (envelope.success === true && envelope.data !== undefined) return envelope.data as T;
  }
  return raw as T;
}

/** GET /api/v1/mxm/orders/<order_id> — cashier/general. Backend may return { success, data } */
export async function fetchOrderById(orderId: string): Promise<OrderDetail> {
  const url = API_PATHS.mxmOrderDetail(orderId);
  const response = await client.get<unknown>(url);
  const data = response.data;
  if (__DEV__) {
    console.log('[fetchOrderById] GET', url, 'full response body:', JSON.stringify(data));
  }
  return unwrapData<OrderDetail>(data);
}

/** GET /api/v1/driver/orders/<order_id> — driver app. Falls back to mxm on 404. */
export async function fetchDriverOrderById(orderId: string): Promise<OrderDetail> {
  const url = API_PATHS.driverOrderDetail(orderId);
  try {
    const response = await client.get<unknown>(url);
    const data = response.data;
    if (__DEV__) {
      console.log('[fetchDriverOrderById] GET', url, 'full response body:', JSON.stringify(data));
    }
    return unwrapData<OrderDetail>(data);
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      if (__DEV__) console.log('[fetchDriverOrderById] 404, fallback to mxm/orders/:id');
      return fetchOrderById(orderId);
    }
    throw err;
  }
}

/** App-context aware: driver -> driver endpoint, cashier -> mxm endpoint. */
export async function fetchOrderDetailForApp(orderId: string): Promise<OrderDetail> {
  if (config.appContext === 'driver') return fetchDriverOrderById(orderId);
  return fetchOrderById(orderId);
}

/** App-context aware: driver -> driver/delivery, cashier -> orders/delivery. */
export async function fetchDeliveryForApp(orderId: string): Promise<DeliveryInfo> {
  if (config.appContext === 'driver') return fetchDriverOrderDelivery(orderId);
  return fetchOrderDelivery(orderId);
}

/** GET /api/v1/orders/<order_id>/delivery — backend may return { success, data } */
export async function fetchOrderDelivery(orderId: string): Promise<DeliveryInfo> {
  const url = API_PATHS.orderDelivery(orderId);
  const response = await client.get<unknown>(url);
  const data = response.data;
  if (__DEV__) {
    console.log('[fetchOrderDelivery] GET', url, 'full response body:', JSON.stringify(data));
  }
  return unwrapData<DeliveryInfo>(data);
}

/** Normalize delivery payload: use picking_id; cod_confirmed from top-level or nested data. */
function normalizeDeliveryData(raw: Record<string, unknown>): DeliveryInfo {
  const pickingId =
    raw.picking_id != null
      ? (raw.picking_id as number | null)
      : (raw.delivery_picking_id != null ? (raw.delivery_picking_id as number | null) : undefined);
  const nested = (raw.data && typeof raw.data === 'object') ? (raw.data as Record<string, unknown>) : null;
  const codConfirmed =
    raw.cod_confirmed === true ||
    (nested && nested.cod_confirmed === true);
  const codConfirmedAt = (raw.cod_confirmed_at ?? nested?.cod_confirmed_at) ?? null;
  const codConfirmedAmount =
    raw.cod_confirmed_amount != null
      ? Number(raw.cod_confirmed_amount)
      : nested?.cod_confirmed_amount != null
        ? Number(nested.cod_confirmed_amount)
        : null;
  return {
    ...raw,
    ...(nested || {}),
    picking_id: pickingId ?? (nested?.picking_id != null ? Number(nested.picking_id) : null),
    next_actions: Array.isArray(raw.next_actions) ? (raw.next_actions as string[]) : (Array.isArray(nested?.next_actions) ? (nested!.next_actions as string[]) : raw.next_actions),
    payment_method: (raw.payment_method ?? nested?.payment_method) ?? null,
    cod_confirmed: codConfirmed,
    cod_confirmed_at: codConfirmedAt,
    cod_confirmed_amount: codConfirmedAmount,
  } as DeliveryInfo;
}

/** GET /api/v1/driver/orders/<order_id>/delivery — Drive app. Falls back to orders/:id/delivery on 404. */
export async function fetchDriverOrderDelivery(orderId: string): Promise<DeliveryInfo> {
  const url = API_PATHS.driverOrderDelivery(orderId);
  try {
    const response = await client.get<unknown>(url);
    const data = response.data;
    if (__DEV__) {
      console.log('[DELIVERY RAW]', JSON.stringify(data));
    }
    const unwrapped = unwrapData<Record<string, unknown>>(data);
    const delivery = normalizeDeliveryData(unwrapped ?? {});
    if (__DEV__) {
      console.log('[DELIVERY PARSED]', {
        cod_confirmed: delivery.cod_confirmed,
        cod_confirmed_at: delivery.cod_confirmed_at,
        payment_method: delivery.payment_method,
      });
    }
    return delivery;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      if (__DEV__) console.log('[fetchDriverOrderDelivery] 404, fallback to orders/:id/delivery');
      return fetchOrderDelivery(orderId);
    }
    throw err;
  }
}

/** Response envelope from POST delivery/status: { success, data?: { current_status, timeline, ... } } */
interface DeliveryStatusResponseEnvelope {
  success?: boolean;
  data?: DeliveryInfo;
  code?: string;
  message?: string;
  request_id?: string;
}

/** POST /api/v1/driver/orders/<order_id>/delivery/status Body: { status, note? }. Bearer required. Drive app. */
export async function updateDeliveryStatus(
  orderId: string,
  payload: DeliveryStatusPayload
): Promise<DeliveryInfo> {
  const postUrl = API_PATHS.driverOrderDeliveryStatus(orderId);
  if (__DEV__) {
    console.log('[updateDeliveryStatus] POST', postUrl, 'payload', JSON.stringify(payload));
  }
  const response = await client.post<DeliveryStatusResponseEnvelope>(postUrl, payload);
  const status = response.status;
  const body = response.data;
  if (__DEV__) {
    console.log('[updateDeliveryStatus] full response', { status, body: JSON.stringify(body) });
  }
  if (status === 200 && body != null) {
    if (body.success === true && body.data != null) {
      return body.data as DeliveryInfo;
    }
    if (body.success === false) {
      const err = new Error(body.message ?? 'Status update was not applied.') as Error & {
        status?: number;
        code?: string;
        request_id?: string;
      };
      err.status = 200;
      err.code = body.code;
      err.request_id = body.request_id;
      throw err;
    }
  }
  return unwrapData<DeliveryInfo>(body);
}

/** POST /api/v1/drive/orders/:id/status Body: { code } — prefer when backend supports it */
export async function updateDriveOrderStatus(
  orderId: string,
  code: string
): Promise<DeliveryInfo> {
  const { data } = await client.post<unknown>(
    API_PATHS.driveOrderStatus(orderId),
    { code }
  );
  return unwrapData<DeliveryInfo>(data);
}

const BATCH_CONCURRENCY = 6;

/** Refetch order detail + delivery (source of truth). Uses app-context: driver -> driver endpoints, cashier -> mxm. */
export async function refetchOrderAndDelivery(
  orderId: string
): Promise<{ order: OrderDetail; delivery: DeliveryInfo }> {
  const fetchOrder = config.appContext === 'driver' ? fetchDriverOrderById : fetchOrderById;
  const fetchDelivery =
    config.appContext === 'driver' ? fetchDriverOrderDelivery : fetchOrderDelivery;
  const [order, delivery] = await Promise.all([
    fetchOrder(orderId),
    fetchDelivery(orderId),
  ]);
  return { order, delivery };
}

/** POST /api/v1/orders/<id>/cash-confirm — cashier confirms COD payment after delivered. */
export async function cashConfirmOrder(orderId: string): Promise<OrderDetail> {
  const url = API_PATHS.orderCashConfirm(orderId);
  if (__DEV__) console.log('[cashConfirmOrder] POST', url);
  const response = await client.post<unknown>(url, {});
  const data = response.data;
  return unwrapData<OrderDetail>(data);
}

export interface DriverCodConfirmPayload {
  amount?: number;
  note?: string;
}

/** POST /api/v1/driver/orders/<order_id>/cod/confirm — driver confirms COD received. */
export async function confirmDriverCod(
  orderId: string,
  payload: DriverCodConfirmPayload = {}
): Promise<DeliveryInfo> {
  const url = API_PATHS.driverOrderCodConfirm(orderId);
  if (__DEV__) console.log('[confirmDriverCod] POST', url, payload);
  const response = await client.post<unknown>(url, payload);
  const data = response.data;
  const unwrapped = unwrapData<Record<string, unknown>>(data ?? {});
  return normalizeDeliveryData(unwrapped ?? {});
}

/** Fetch delivery for multiple orders in parallel (throttled). For list enrichment when list API has no delivery. */
export async function fetchDeliveryBatch(
  orderIds: string[],
  concurrency = BATCH_CONCURRENCY
): Promise<Record<string, DeliveryInfo>> {
  const result: Record<string, DeliveryInfo> = {};
  for (let i = 0; i < orderIds.length; i += concurrency) {
    const chunk = orderIds.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      chunk.map((id) => fetchOrderDelivery(String(id)).then((d) => ({ id: String(id), d })))
    );
    for (const s of settled) {
      if (s.status === 'fulfilled') result[s.value.id] = s.value.d;
    }
  }
  return result;
}
