# No delivery picking — error handling

## Backend error

- **HTTP:** 400  
- **code:** `VALIDATION_ERROR`  
- **message:** contains `"No delivery picking found"`  
- **Cause:** Delivery picking was never created in Odoo (order not confirmed or warehouse/flow misconfiguration).

## Error classification (mobile)

```ts
import { API_CODES } from '@/types/api';
import type { NormalizedError } from '@/api/client';
import { NO_DELIVERY_PICKING_MESSAGE_SUBSTRING } from '@/constants/deliveryErrors';

function isNoDeliveryPickingError(norm: NormalizedError): boolean {
  return (
    norm.status === 400 &&
    norm.code === API_CODES.VALIDATION_ERROR &&
    (norm.message ?? '').includes(NO_DELIVERY_PICKING_MESSAGE_SUBSTRING)
  );
}
```

## UX copy (Mongolian)

- **User message:** `Энэ захиалга агуулахаас гараагүй байна. Админ баталгаажуулна уу.`
- **Status when blocked:** `Хүлээгдэж байна`

Never show raw backend message to the driver.

## UX behavior

When this error is detected (or when defensive check finds no picking):

1. Show the Mongolian message above (no generic "Алдаа" only).
2. Disable delivery status buttons (Prepared / Delivered).
3. Show order as "Хүлээгдэж байна" in hero and in timeline.
4. Do not show retry button for this error (prevents retry spam).
5. Do not add to pending delivery queue (no point retrying until admin confirms).

## Logging (developers only)

In `__DEV__` only:

- `requestId`
- `orderId`
- `currentStatus` (delivery code)

Not exposed in UI.

## Which data triggers the UI message

The message **"Энэ захиалга агуулахаас гараагүй байна. Админ баталгаажуулна уу."** is shown in two cases:

1. **Defensive (before any POST):** After `refetchSourceOfTruth()` we read the **order** from **GET /api/v1/mxm/orders/:id**. If that order has neither `delivery_picking_id` (set and non-empty) nor `picking_ids` (non-empty array), we block and show the message **without calling** POST delivery/status. So the trigger is: **order.delivery_picking_id** and **order.picking_ids** from the mxm order detail response.
2. **Backend error (after POST):** If we do call POST and the backend returns HTTP 400 with `code === 'VALIDATION_ERROR'` and `message` containing `"No delivery picking found"`, we show the same message.

So if you only see GETs in logs and no POST when tapping "update status", the app is taking the defensive path because the order from GET /mxm/orders/:id has no picking data. Fix by ensuring the mxm order detail API returns `delivery_picking_id` or `picking_ids` when the order has left the warehouse, or by aligning with the driver API if status is provided there.

**Note:** The app currently calls **POST /api/v1/orders/:id/delivery/status** (see `API_PATHS.orderDeliveryStatus`). If your backend expects **POST /api/v1/driver/orders/:id/delivery/status**, use `API_PATHS.driverOrderDeliveryStatus` in `updateDeliveryStatus` or add a try-driver-first fallback.

## Defensive flow

Before calling the delivery-status API:

1. Refetch order + delivery (`refetchSourceOfTruth()`).
2. If `delivery_picking_id` or `picking_ids` is missing on the **order** (from GET mxm/orders/:id) → block action locally, show Mongolian message, do not call API.

This avoids unnecessary 400s and gives the same clear UX when the backend would have returned "No delivery picking found".

## Why this improves system reliability

- **No dependence on backend perfection:** App handles missing picking both when the API returns 400 and before calling the API (defensive check).
- **Clear for the driver:** One message in Mongolian explaining that the order has not left the warehouse and admin must confirm. No technical or raw backend text.
- **No retry spam:** Buttons are disabled and the error is not queued for retry, so the driver cannot hammer the API.
- **Single source of copy:** All user-facing strings live in `constants/deliveryErrors.ts`; logging stays in code and is dev-only.
