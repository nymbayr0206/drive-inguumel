# Inguumel Drive

React Native (Expo) app for **warehouse owners** only: login (no register), view orders for assigned warehouses, order detail, delivery timeline, status updates. Backend: Odoo 19 custom API. No `/api/v1/driver/*` usage; all paths in `api/paths.ts`.

## Stack

- **Expo** (SDK 54) + **TypeScript**
- **expo-router**, **Zustand**, **expo-secure-store** (token) + **AsyncStorage**
- **Axios** with Bearer interceptor, `[HTTP OUT]` / `[HTTP IN]` logging

## Env

- **Prod:** `http://72.62.247.95:8069`
- **Local:** `http://localhost:8069`

Set `EXPO_PUBLIC_API_BASE_URL` in `.env` or `config/env.ts`.

## Setup

```bash
cd inguumel_drive
npm install
cp .env.example .env   # optional
npx expo start
```

Open in Expo Go (scan QR) or `i` / `a` for simulator.

## API (Odoo 19 – see `api/paths.ts`)

- **Auth:** POST `/api/v1/auth/login` — Body: `{ phone (8 digits), pin (6 digits) }` → `{ success, data: { access_token, role, warehouse_ids, ... } }`
- **Orders:** GET `/api/v1/mxm/orders?limit=&offset=` — List (backend scopes by warehouse)
- **Detail:** GET `/api/v1/mxm/orders/<order_id>`
- **Delivery:** GET `/api/v1/orders/<order_id>/delivery`
- **Status:** POST `/api/v1/orders/<order_id>/delivery/status` — Body: `{ status, note? }`

Order detail uses **`lines`** from the backend (with fallback to `order_line`). Delivery polling on the detail screen uses **`version`** from GET delivery to skip redundant state updates when nothing changed.

## Auth & storage

- Token in **expo-secure-store**; auth profile in AsyncStorage.
- **Only** `role === "warehouse_owner"` may use the app; token is persisted only then.
- On app start: **hydrate from storage only** (no /me call). If role !== warehouse_owner or `warehouse_ids` empty → clear storage, show Login. If warehouse_owner with empty warehouses → “No warehouses assigned” / blocked.

## Error handling

- **401** → logout, redirect to login.
- **403** `WAREHOUSE_NOT_ASSIGNED` → blocked screen.
- **403** `FORBIDDEN` → “Not permitted”.
- **400** `VALIDATION_ERROR` → show `message`.
- **500** without `request_id` → “Server error” and log full response.

Logging: `[HTTP OUT]` and `[HTTP IN]` with method, url, status, code, request_id.

## Test checklist

- Login with valid warehouse owner → success, non-empty `warehouse_ids` → Orders list.
- Login with user missing group → 403.
- Login with empty `warehouse_ids` → Blocked screen (or 403 WAREHOUSE_NOT_ASSIGNED).
- Orders list returns only allowed warehouses (backend scope).
- Open order from other warehouse (if you have an id) → 403 “Not permitted”.
- Delivery update invalid transition → 400 VALIDATION_ERROR.

## Manual integration test (curl)

Get a token from the backend, then call orders/delivery (replace `BASE` and `TOKEN`):

```bash
BASE=http://72.62.247.95:8069
# Login (get token from response data.access_token)
curl -s -X POST "$BASE/api/v1/auth/login" -H "Content-Type: application/json" \
  -d '{"phone":"00000000","pin":"123123"}' | jq .

# List orders (use token from login)
TOKEN="<paste access_token here>"
curl -s "$BASE/api/v1/mxm/orders?limit=5&offset=0" -H "Authorization: Bearer $TOKEN" | jq .

# Order detail (use order_id from list)
curl -s "$BASE/api/v1/mxm/orders/<order_id>" -H "Authorization: Bearer $TOKEN" | jq .

# Delivery
curl -s "$BASE/api/v1/orders/<order_id>/delivery" -H "Authorization: Bearer $TOKEN" | jq .
```

## Files (PR scope)

- **api/paths.ts** — Central API paths (no driver/*).
- **api/auth.ts** — POST /api/v1/auth/login only; staff gate `warehouse_owner`.
- **api/orders.ts** — mxm/orders list & detail; orders/<id>/delivery & delivery/status.
- **store/authStore.ts** — Hydrate from storage only; allow only warehouse_owner.
- **screens/LoginScreen.tsx** — KeyboardAvoidingView, ScrollView, number-pad, spinner when submitting.
- **screens/OrdersListScreen.tsx** — keyExtractor `order_id`; fetch with mxm/orders.
- **screens/OrderDetailScreen.tsx** — Uses order_id from route; mxm detail + orders delivery.
- **types/api.ts** — Order.order_id as primary key.
