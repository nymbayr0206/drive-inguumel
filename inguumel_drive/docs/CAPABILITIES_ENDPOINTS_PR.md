# PR: Capabilities + Endpoints (Driver + Cashier)

## Summary

Makes button visibility and API endpoints correct and robust by:
1. Storing `capabilities`, `roles[]`, `primary_role` from login (with `role` as fallback)
2. Using capability-based button visibility instead of role checks
3. Fixing order/delivery endpoints (no calls to GET `/api/v1/orders/<id>`)
4. Sending `X-App` header on login

## Changes

### 1. Auth storage (login + hydrate)

- **types/api.ts**: Added `Capabilities`, `roles`, `primary_role` to `LoginResponseData` and `LoginResponse`
- **store/authStore.ts**: Persist `capabilities`, `roles`, `primary_role`; hydrate uses them with `role` as fallback
- **api/auth.ts**: Parse `capabilities`, `roles`, `primary_role` from login response
- **screens/LoginScreen.tsx**: Pass new fields to `persistAuth`
- **api/auth.ts**: `isDriveStaff` and `hasNoWarehouseAssigned` use capabilities/roles/primary_role with fallback

### 2. Button visibility (capability-based)

- **Driver status update buttons**: Shown only when `capabilities.can_driver_update_delivery_status === true` (fallback: role in driver/delivery_staff/warehouse_owner/admin)
- **Cash confirm button**: Shown when `capabilities.can_cash_confirm === true` AND `payment_method === "cod"` AND `is_paid === false` AND `delivery_status === "delivered"`
- **DeliveryTimeline.tsx**: New prop `canDriverUpdateDeliveryStatus`; hides driver buttons when false
- **OrderDetailScreen.tsx**: Cash confirm button "Төлбөр хүлээн авсан" with conditions above

### 3. Endpoints

- **Order detail**:
  - Driver app: `GET /api/v1/driver/orders/<id>` (fallback to mxm on 404)
  - Cashier/general: `GET /api/v1/mxm/orders/<id>`
- **Delivery read**:
  - Driver app: `GET /api/v1/driver/orders/<id>/delivery` (fallback to orders on 404)
  - Cashier: `GET /api/v1/orders/<id>/delivery`
- **Driver update**: `POST /api/v1/driver/orders/<id>/delivery/status` (unchanged)
- **Cash confirm**: `POST /api/v1/orders/<id>/cash-confirm` (new)
- **Removed**: No calls to `GET /api/v1/orders/<id>` remain

### 4. Login headers

- Driver app: sends `X-App: driver` on login
- Cashier: sends `X-App: cashier` (set `EXPO_PUBLIC_APP_CONTEXT=cashier` for cashier build)

## Config

- **config/env.ts**: `appContext` = `EXPO_PUBLIC_APP_CONTEXT` ?? `'driver'`

## Quick test steps

1. **Driver user with Warehouse Owner group**
   - Login as user in both driver and warehouse_owner groups
   - Backend should return `capabilities.can_driver_update_delivery_status: true`
   - On order detail, "Хүргэгдсэн" button should appear when status is out_for_delivery

2. **Cashier – cash confirm**
   - Login as cashier (or user with can_cash_confirm)
   - Open order with: COD, unpaid, delivered
   - "Төлбөр хүлээн авсан" button should appear
   - Tap → POST cash-confirm → order updates

3. **No GET /api/v1/orders/<id>**
   - Search codebase: no calls to plain order detail endpoint
   - Driver uses driver/orders; cashier uses mxm/orders

4. **Login X-App**
   - In dev tools or proxy, verify login request includes `X-App: driver` (or `cashier` when configured)
