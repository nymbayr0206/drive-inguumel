# PR: Fix 401 Unauthorized + Dynamic Delivery Actions

## Summary

1. **401 Unauthorized on OrdersList**: Wait for auth hydration before API calls, add 401 handling (clear session, redirect to Login, show "Session expired" message).
2. **Dynamic delivery action buttons**: Use backend `next_actions` with permission filter, `blocked_reason` handling, backward compatibility.

---

## 1) 401 Fix – Changed Files

- **`store/authStore.ts`**
  - Added `sessionExpiredMessage: string | null` and `setSessionExpired(message)`.
  - `logout()` preserves `sessionExpiredMessage` so Login screen can show it.

- **`app/_layout.tsx`**
  - `onUnauthorized` now: `setSessionExpired('Session expired. Please log in again.')` → `logout()` → `router.replace('/login')`.

- **`screens/OrdersListScreen.tsx`**
  - Subscribes to `hydrated`; only runs `loadInitial` when `hydrated === true`.
  - Shows "Уншиж байна…" loading state until hydrated.
  - `useFocusEffect` polling starts only when hydrated.
  - On error, logs `{ status, message, code, url }` in `__DEV__` (URL from axios config or endpoint path).

- **`screens/LoginScreen.tsx`**
  - On mount, if `sessionExpiredMessage` is set, shows it as error and clears it.

---

## 2) Dynamic Delivery Actions – Previous Implementation (Verified)

- **`types/api.ts`**: `DeliveryInfo` has `next_actions`, `blocked_reason`, `picking_id`, `picking_state`.
- **`store/authStore.ts`**: `canManageWarehouse(capabilities, role)` helper.
- **`components/DeliveryTimeline.tsx`**:
  - Uses `delivery.next_actions` when present; fallback to local `TRANSITIONS`.
  - Permission filter:
    - `canManageWarehouse === true`: show all `next_actions` (including cancelled).
    - Driver only (`can_driver_update_delivery_status` true, `can_manage_warehouse` false): only out_for_delivery→delivered.
  - `blocked_reason === "NO_DELIVERY_PICKING"`: warning banner + all buttons disabled.
  - "Үйлдэл байхгүй" only when filtered actions empty and `blocked_reason` null.
- **`screens/OrderDetailScreen.tsx`**: Passes `canManageWarehouse` to `DeliveryTimeline`.

---

## Quick Manual Test Steps

### 401 / OrdersList

1. **Driver login → Orders list no 401**
   - Login as driver.
   - Confirm Orders list loads without 401.
   - In `__DEV__`, check console for `[fetchDriveOrders] endpoint` and response.

2. **401 handling**
   - Invalidate token (or use expired token).
   - Trigger any protected request (e.g. refresh Orders list).
   - Confirm: redirect to Login and "Session expired. Please log in again." shown.

3. **Hydration**
   - Cold start app with valid token in storage.
   - Confirm Orders list waits for hydration (shows "Уншиж байна…") before loading.

### Delivery actions

4. **preparing → prepared (warehouse_owner)**
   - Login as warehouse_owner (or user with `can_manage_warehouse`).
   - Open order with `current_status.code === "preparing"` and `next_actions: ["prepared","cancelled"]`.
   - Confirm "Бэлтгэж дууссан" and "Цуцлагдсан" buttons appear.
   - Tap "Бэлтгэж дууссан" → POST → success toast → delivery refetched.

5. **out_for_delivery → delivered (driver)**
   - Login as driver (no `can_manage_warehouse`).
   - Open order with `current_status.code === "out_for_delivery"` and `next_actions: ["delivered"]`.
   - Confirm "Хүргэгдсэн" button.
   - Tap → POST → success toast → delivery refetched.

6. **blocked_reason scenario**
   - Open order where delivery response has `blocked_reason: "NO_DELIVERY_PICKING"`.
   - Confirm warning banner: "Хүргэлтийн picking үүсээгүй байна. Захиалгаа confirm/stock rule үүссэн эсэхийг шалгана уу."
   - Confirm all delivery action buttons disabled.

7. **OrdersList no longer 401**
   - Login as driver.
   - Open Orders list.
   - Confirm no 401 in console and list loads correctly.
