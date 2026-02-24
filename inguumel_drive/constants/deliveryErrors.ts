/**
 * Delivery status error handling.
 * Never show raw backend messages to users; use clear Mongolian copy.
 */

/** Backend message substring that indicates no delivery picking was created (Odoo). */
export const NO_DELIVERY_PICKING_MESSAGE_SUBSTRING = 'No delivery picking found';

/** User-facing message when order has no delivery picking (admin must confirm order). */
export const MSG_NO_PICKING_MN =
  'Энэ захиалга агуулахаас гараагүй байна. Админ баталгаажуулна уу.';

/** Status label shown when order is blocked waiting for picking (no action possible). */
export const MSG_WAITING_MN = 'Хүлээгдэж байна';
