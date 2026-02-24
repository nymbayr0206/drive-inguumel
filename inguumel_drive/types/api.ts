/** Allowed roles for app (login: warehouse_owner/delivery_staff with warehouses) */
export type AppRole = 'warehouse_owner' | 'driver' | 'delivery_staff';

export interface LoginPayload {
  phone: string;
  pin: string;
}

/** Backend success: { success: true, data: { ... } } */
export interface LoginResponseEnvelope {
  success?: boolean;
  data?: LoginResponseData;
  request_id?: string;
}

/** Canonical capabilities from backend; used for button visibility. */
export interface Capabilities {
  can_driver_update_delivery_status?: boolean;
  can_cash_confirm?: boolean;
  can_manage_warehouse?: boolean;
  [key: string]: boolean | undefined;
}

export interface LoginResponseData {
  uid: string;
  partner_id: string;
  access_token: string;
  expires_in?: number;
  role: string;
  warehouse_ids: number[] | string[];
  /** Canonical; prefer over role for UI. */
  capabilities?: Capabilities;
  /** Fallback; list of roles from group membership. */
  roles?: string[];
  /** Fallback; primary role when app context given. */
  primary_role?: string;
}

/** Flattened for app use after parsing envelope */
export interface LoginResponse {
  access_token: string;
  uid: string;
  partner_id: string;
  role: string;
  warehouse_ids: string[];
  capabilities?: Capabilities;
  roles?: string[];
  primary_role?: string;
}

/** Standard API envelope: success, code, message, request_id */
export interface ApiEnvelope {
  success?: boolean;
  code?: string;
  message?: string;
  request_id?: string;
}

export interface Order {
  /** Backend primary key; use for keyExtractor and detail route */
  order_id: string | number;
  id?: string | number;
  order_number?: string;
  date_order?: string;
  amount_total?: number;
  payment_status_label_mn?: string;
  order_state_label_mn?: string;
  /** Delivery status from list API (optional). Single source of truth for tabs. */
  delivery_status_code?: string;
  delivery_status_label?: string;
  delivery_status_label_mn?: string;
  is_delivered?: boolean;
  is_cancelled?: boolean;
  partner_id?: string;
  state?: string;
  /** Backend: order state code (prefer over state when present) */
  order_state_code?: string;
  /** Backend: payment state code */
  payment_state_code?: string;
  partner_name?: string;
  partner_phone?: string;
  partner_shipping_id?: string;
  /** Backend: payment_method code (e.g. "cod" for cash on delivery). */
  payment_method?: string;
  /** Backend: whether order is paid. */
  is_paid?: boolean;
  /** Backend: delivery status code. */
  delivery_status?: string;
  /** From delivery or optimistic patch: COD confirmed by driver. */
  cod_confirmed?: boolean;
  /** From delivery or patch: when COD was confirmed. */
  cod_confirmed_at?: string | null;
  [key: string]: unknown;
}

/** Backend: partner { id, name, phone } */
export interface OrderPartner {
  id?: number;
  name?: string;
  phone?: string;
}

/** Backend: shipping { address_text, phone_primary, phone_secondary } */
export interface OrderShipping {
  address_text?: string;
  phone_primary?: string;
  phone_secondary?: string;
}

export interface OrderDetail extends Order {
  /** Backend primary: lines array */
  lines?: OrderLine[];
  /** Legacy */
  order_line?: OrderLine[];
  partner?: OrderPartner;
  shipping?: OrderShipping;
  partner_name?: string;
  partner_phone?: string;
  amount_total?: number;
  amount_untaxed?: number;
  amounts?: { total?: number; untaxed?: number; tax?: number };
  currency?: string;
  [key: string]: unknown;
}

/** Backend: id, product_id, product_name, qty, uom, price_unit, discount, subtotal, tax_amount, image_url */
export interface OrderLine {
  id?: number;
  product_id?: number | [number, string];
  product_name?: string;
  name?: string;
  qty?: number;
  product_uom_qty?: number;
  uom?: string;
  price_unit?: number;
  discount?: number;
  subtotal?: number;
  price_subtotal?: number;
  tax_amount?: number;
  image_url?: string;
  [key: string]: unknown;
}

export interface DeliveryStatusItem {
  code?: string;
  label?: string;
  at?: string;
  note?: string;
  is_current?: boolean;
}

/** GET /api/v1/orders/<id>/delivery: current_status { code, label, at }, timeline [], version */
export interface DeliveryInfo {
  order_id?: string;
  status?: string;
  current_status?: { code?: string; label?: string; at?: string };
  /** Backend: timeline [{ code, label, at, is_current, note }] */
  timeline?: DeliveryStatusItem[];
  /** Legacy alias */
  history?: DeliveryStatusItem[];
  /** Backend alternative name for timeline */
  status_history?: DeliveryStatusItem[];
  /** Last log id – use to skip redundant state updates when polling */
  version?: number | string;
  last_update_at?: string;
  /** Backend: allowed next status codes (e.g. ["prepared","cancelled"]) */
  next_actions?: string[];
  /** Backend: e.g. "NO_DELIVERY_PICKING" when picking not created */
  blocked_reason?: string | null;
  /** Backend: single outgoing picking id (use this, not delivery_picking_id or picking_ids) */
  picking_id?: number | null;
  picking_state?: string | null;
  /** Backend: payment method code (e.g. "cod") */
  payment_method?: string | null;
  /** Backend: whether COD has been confirmed by driver */
  cod_confirmed?: boolean;
  /** Set after COD confirm: when and how much */
  cod_confirmed_at?: string | null;
  cod_confirmed_amount?: number | null;
  [key: string]: unknown;
}

/** Cached delivery snapshot for list items. Source: GET delivery or list API delivery fields. */
export interface DeliverySnapshot {
  code: string;
  label: string;
  last_update_at?: string;
  version?: number | string;
  /** From delivery: COD confirmed by driver (for payment label in list). */
  cod_confirmed?: boolean;
  cod_confirmed_at?: string | null;
}

/** Order list item with delivery from cache or API. Filter tabs by delivery.code. */
export interface OrderListItem extends Order {
  delivery?: DeliverySnapshot;
}

export interface DeliveryStatusPayload {
  status: string;
  note?: string;
}

export interface ApiErrorBody extends ApiEnvelope {
  code?: string;
  message?: string;
  request_id?: string;
  [key: string]: unknown;
}

/** Error codes we handle */
export const API_CODES = {
  WAREHOUSE_NOT_ASSIGNED: 'WAREHOUSE_NOT_ASSIGNED',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;
