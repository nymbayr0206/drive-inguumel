# Drive app order status update — fix deliverables

## Summary

- **RN:** Removed defensive no-picking guard; always allow POST when user taps status. Use driver endpoints: GET/POST `/api/v1/driver/orders/<id>/delivery` and `.../delivery/status`. Show backend error message/code instead of generic "warehouse not released" unless backend explicitly returns NO_DELIVERY_PICKING.
- **Backend:** Added GET `/api/v1/driver/orders/<order_id>/delivery` (reference implementation in `delivery_pipeline_edits/backend/driver_delivery_controller.py`). POST `/api/v1/driver/orders/<id>/delivery/status` already exists and works.

---

## A) React Native — file paths and code changes

### 1. API paths — `inguumel_drive/api/paths.ts`

- Added `driverOrderDelivery(orderId)` → `/api/v1/driver/orders/${orderId}/delivery`.
- Drive app now uses `driverOrderDelivery` and `driverOrderDeliveryStatus` for delivery GET and POST.

### 2. API client — `inguumel_drive/api/orders.ts`

- **New:** `fetchDriverOrderDelivery(orderId)` — GET `/api/v1/driver/orders/<id>/delivery` with fallback to GET `/api/v1/orders/<id>/delivery` on 404.
- **Changed:** `updateDeliveryStatus()` now uses `API_PATHS.driverOrderDeliveryStatus(orderId)` (POST `/api/v1/driver/orders/<id>/delivery/status`) with body `{ status, note? }`.
- **Changed:** `refetchOrderAndDelivery()` uses `fetchDriverOrderDelivery()` for the delivery part instead of `fetchOrderDelivery()`.

### 3. DeliveryTimeline — `inguumel_drive/components/DeliveryTimeline.tsx`

- **Removed:** Defensive guard that called `hasDeliveryPicking(fresh.order)` and blocked POST with alert "Энэ захиалга агуулахаас гараагүй байна...". Removed `hasDeliveryPicking` and the refetch-before-POST block that set `blockedNoPicking` and showed that message.
- **Behavior:** On status button tap we always call `updateDeliveryStatus(orderId, { status: statusCode })` (driver POST). After success we call `onUpdated(responseData)`, show success alert, and call `refetchSourceOfTruth().catch(() => {})`.
- **Error handling:** We only show "Энэ захиалга агуулахаас гараагүй байна..." when `isNoDeliveryPickingError(norm)` is true (backend returns 400 + "No delivery picking found" or `code === 'NO_DELIVERY_PICKING'`). For all other errors we show `norm.message` and optionally `norm.code` / request_id (no generic MSG_INVALID_TRANSITION override).
- **Banner:** Yellow "blocked no picking" banner only appears when the backend explicitly returns a no-delivery-picking error, not from a local defensive check.

### 4. OrderDetailScreen — `inguumel_drive/screens/OrderDetailScreen.tsx`

- **Changed:** `loadDetail` and `pollDelivery` use `fetchDriverOrderDelivery(orderId)` instead of `fetchOrderDelivery(orderId)`.
- `refetchSourceOfTruth` still uses `refetchOrderAndDelivery(orderId)`, which now uses `fetchDriverOrderDelivery` internally.

### 5. Pending delivery store — `inguumel_drive/store/pendingDeliveryStore.ts`

- **Changed:** Pending queue now calls only `updateDeliveryStatus(item.orderId, { status: item.code })` (driver POST). Removed the try `updateDriveOrderStatus` then fallback to `updateDeliveryStatus`.

---

## B) Backend — Odoo (inguumel_order_mxm)

### Option 1: Add GET driver delivery (recommended)

**File to add or extend:** e.g. `controllers/driver_delivery_controller.py` (or merge into existing driver controller).

**Reference implementation:** See `delivery_pipeline_edits/backend/driver_delivery_controller.py` in this repo.

- **Route:** GET `/api/v1/driver/orders/<int:order_id>/delivery`
- **Auth:** `auth="user"` (Bearer token from driver login).
- **Logic:**
  - Browse order (sudo + exists).
  - Check warehouse scope (order’s warehouse in user’s assigned warehouses).
  - Build payload with: `order_id`, `current_status`, `timeline`, `version`, `last_update_at`, `picking_id` (nullable), `picking_state` (nullable), `picking_ids` (list), optionally `stock_effect`.
- **Response:** `{"success": true, "code": "OK", "data": { ... } }` — same shape as POST `.../delivery/status` success.

**Diff-style snippet (conceptual):**

```python
# New controller: driver_delivery_controller.py
@http.route("/api/v1/driver/orders/<int:order_id>/delivery", type="http", auth="user", methods=["GET"], csrf=False)
def get_driver_order_delivery(self, order_id, **kwargs):
    order = request.env["sale.order"].sudo().browse(order_id)
    if not order.exists():
        return request.make_response(json.dumps({"success": False, "code": "NOT_FOUND", "message": "Order not found"}), ...)
    # warehouse scope check using order_in_warehouse_scope(order, user_warehouse_ids)
    payload = _delivery_payload_from_order(order)  # include picking_id, picking_state, picking_ids
    return request.make_response(json.dumps({"success": True, "code": "OK", "data": payload}), headers=[("Content-Type", "application/json")])
```

### Option 2: Extend existing GET `/api/v1/orders/<id>/delivery`

- Add to the existing delivery response: `picking_id`, `picking_state`, `picking_ids`, and optionally `has_outgoing_picking` (boolean).
- Then RN can keep using customer endpoint for delivery GET until driver GET is deployed; driver POST is already used by RN.

---

## C) Verification

### 1. Create order and confirm picking (backend)

- Create a new sale order and confirm it so that an outgoing picking is created.
- (Exact steps depend on your Odoo flow; e.g. Confirm Order and ensure stock picking type "outgoing" exists.)

### 2. CLI — driver login and driver delivery GET

```bash
# Base URL (set to your API)
BASE=https://your-odoo.example.com
# Driver login (phone/pin)
TOKEN=$(curl -s -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"DRIVER_PHONE","pin":"DRIVER_PIN"}' | jq -r '.data.access_token // .access_token')

# GET driver delivery (order 57)
curl -s -X GET "$BASE/api/v1/driver/orders/57/delivery" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected:** 200, `success: true`, `data` with `order_id`, `current_status`, `timeline`, `version`, and (if implemented) `picking_id`, `picking_state`, `picking_ids`.

### 3. CLI — POST status updates

```bash
# Preparing
curl -s -X POST "$BASE/api/v1/driver/orders/57/delivery/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"preparing"}' | jq .

# Prepared
curl -s -X POST "$BASE/api/v1/driver/orders/57/delivery/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"prepared"}' | jq .

# Out for delivery
curl -s -X POST "$BASE/api/v1/driver/orders/57/delivery/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"out_for_delivery"}' | jq .

# Delivered
curl -s -X POST "$BASE/api/v1/driver/orders/57/delivery/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"delivered"}' | jq .
```

**Expected:** 200, `success: true`, `data` with updated `current_status`, `timeline`, `version`.

### 4. RN device — order detail and status buttons

1. Open the same order (e.g. 57) in the Drive app order detail screen.
2. Tap next status (e.g. "Бэлтгэж дууссан").
3. **Confirm:** In logs you see `[DeliveryTimeline] POST .../driver/orders/57/delivery/status` and no "POST not called: defensive no-picking" message.
4. **Confirm:** UI updates (timeline/stepper) match backend; no incorrect "агуулахаас гараагүй" unless the backend returns NO_DELIVERY_PICKING or "No delivery picking found".

### 5. Error handling

- Force a 400 or `success: false` from the backend (e.g. invalid transition).
- **Confirm:** Alert shows the backend `message` (and optionally `code`), not the generic "агуулахаас гараагүй" message.

---

## Test checklist

| # | Item | Pass |
|---|------|------|
| 1 | New order creates outgoing picking (backend) | ☐ |
| 2 | Driver login returns token | ☐ |
| 3 | GET `/api/v1/driver/orders/<id>/delivery` returns 200 and body with picking_id/picking_state when picking exists | ☐ |
| 4 | POST `preparing` → `prepared` → `out_for_delivery` → `delivered` return 200 and updated data | ☐ |
| 5 | RN: Open order detail, tap status button → POST is called (no defensive no-picking log) | ☐ |
| 6 | RN: After POST success, UI and cache reflect new status | ☐ |
| 7 | RN: On backend error, alert shows backend message/code, not generic warehouse message | ☐ |
| 8 | RN: "Агуулахаас гараагүй" only when backend returns NO_DELIVERY_PICKING or "No delivery picking found" | ☐ |
