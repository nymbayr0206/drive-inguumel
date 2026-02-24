/**
 * Centralized API paths. Drive app uses /api/v1/driver/* for delivery GET/POST.
 * Odoo 19 custom API contract.
 */
export const API_PATHS = {
  /** Auth: POST body { phone, pin } */
  AUTH_LOGIN: '/api/v1/auth/login',

  /** Orders (mxm): list and detail */
  MXM_ORDERS: '/api/v1/mxm/orders',
  mxmOrderDetail: (orderId: string) => `/api/v1/mxm/orders/${orderId}`,

  /** Delivery: customer/non-driver (used as fallback when driver endpoint returns 404) */
  orderDelivery: (orderId: string) => `/api/v1/orders/${orderId}/delivery`,
  orderDeliveryStatus: (orderId: string) => `/api/v1/orders/${orderId}/delivery/status`,

  /** Driver: order detail and delivery. Drive app uses these. */
  driverOrderDetail: (orderId: string) => `/api/v1/driver/orders/${orderId}`,
  driverOrderDelivery: (orderId: string) => `/api/v1/driver/orders/${orderId}/delivery`,
  driverOrderDeliveryStatus: (orderId: string) => `/api/v1/driver/orders/${orderId}/delivery/status`,
  /** Driver: POST confirm COD payment received. */
  driverOrderCodConfirm: (orderId: string) => `/api/v1/driver/orders/${orderId}/cod/confirm`,

  /** Cash confirm: POST for COD orders after delivered. */
  orderCashConfirm: (orderId: string) => `/api/v1/orders/${orderId}/cash-confirm`,

  /** Drive app: list orders for drivers (warehouse_id, status, limit, offset); newest first */
  DRIVE_ORDERS: '/api/v1/drive/orders',
  driveOrderStatus: (orderId: string) => `/api/v1/drive/orders/${orderId}/status`,
} as const;
