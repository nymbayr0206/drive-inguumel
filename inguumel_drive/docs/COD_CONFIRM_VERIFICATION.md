# COD Confirm Fix – Verification Checklist

## Summary
- **Bug:** After driver COD confirm success, UI showed "Төлбөр хүлээгдэж байна" and console error "Transition from delivered to delivered not allowed" (400).
- **Cause:** Redundant delivery status POST (delivered → delivered) after COD confirm; UI not syncing order + delivery from refetch.
- **Fix:** No delivery status update after COD confirm; refetch order + delivery and set both; no-op guard for status transitions; 400 no-op handled gracefully.

## Code Changes

| File | Change |
|------|--------|
| `DeliveryTimeline.tsx` | No-op guard: if `currentCode === statusCode` skip API. On 400 "transition not allowed" → refetch + friendly toast "Аль хэдийн хүргэгдсэн.", no error alert. |
| `OrderDetailScreen.tsx` | COD confirm success: refetch and set **both** `order` and `delivery`. Hero label: when delivered and (isPaid \|\| codConfirmed) show "Хүргэгдсэн – Баталгаажсан". COD button: `canShowCodConfirm` + !isPaid + !isCancelled. |
| `authStore.ts` | `canShowCodConfirm(capabilities, role)` for driver/cashier/warehouse COD button visibility. |
| `pendingDeliveryStore.ts` | On 400 "transition not allowed" remove item from queue (treat as no-op), no retry. |

## Logic Notes

- **COD confirm flow:** `confirmDriverCod(orderId)` → on 2xx → refetch order + delivery → set order + delivery → success alert. **No** `updateDeliveryStatus('delivered')` after COD confirm.
- **Delivery status update:** Before POST, if `currentStatus === next` return (no API call). If backend returns 400 "Transition from delivered to delivered not allowed", refetch and show "Already delivered" toast; do not show error or rollback.
- **COD button visibility:** Driver app + `canShowCodConfirm` (capability or role driver/delivery_staff/warehouse_owner/cashier/admin) + payment_method COD + !codConfirmed + !isPaid + !cancelled + (delivered or out_for_delivery).

## Quick Manual Test Checklist

1. **Driver login → COD order → button**
   - Log in as driver (role/capability that allows COD confirm).
   - Open a COD order in delivered or out_for_delivery.
   - **Expect:** "COD төлбөр авсан" button visible.

2. **Tap confirm → success → UI**
   - Tap "COD төлбөр авсан".
   - **Expect:** Success alert "COD баталгаажлаа".
   - **Expect:** Hero label becomes "Хүргэгдсэн – Баталгаажсан" (not "Төлбөр хүлээгдэж байна").

3. **No delivered→delivered error**
   - After COD confirm, check console.
   - **Expect:** No "Transition from delivered to delivered not allowed" or 400 error.

4. **Refresh → status correct**
   - Reload app or re-open order.
   - **Expect:** Payment status still "Баталгаажсан" from backend.

## Optional Guard Test
- Inline guard in `DeliveryTimeline`: `if (currentCode === statusCode) return` before calling `updateDeliveryStatus`. No unit test added (no test infra); guard is documented in code comment.

---

## List/Detail payment consistency (COD confirm → list update)

**Change:** After COD confirm on Order Detail, the Orders List shows "Төлөгдсөн" immediately when returning (optimistic patch + focus refetch).

- **orderPatchStore:** Optimistic patch per `orderId`; list merges patch into each order; cleared when list refetches.
- **COD confirm onSuccess:** `setOrderPatch(orderId, { is_paid: true, payment_status_label_mn: 'Төлөгдсөн', cod_confirmed: true })` then refetch order+delivery.
- **OrdersListScreen:** `useFocusEffect` calls `loadPage(0, true)` when screen gains focus (refetch when returning from detail). List items merge `getPatch(id)` into order; after load, `clearPatchesForOrderIds` for loaded ids.
- **paymentLabel(order):** Shared helper in `lib/paymentLabel.ts`: cod_confirmed/cod_confirmed_at or is_paid/paid → "Төлөгдсөн", else "Төлөгдөөгүй". Used by OrderCard and Order Detail (total section).

**Test:** Confirm COD in detail → go back → list must show "Төлөгдсөн" for that order without app restart.

---

## COD payment display fix (single truth + refetch)

**Problem:** After COD confirm, detail/list still showed "Төлөгдөөгүй" because UI read only order.payment_state_code / payment.paid and ignored delivery.cod_confirmed.

**Changes:**
- **Single truth:** For COD orders, payment = "Төлөгдсөн" iff `delivery.cod_confirmed === true` or `delivery.cod_confirmed_at` exists; else "Төлөгдөөгүй". Non-COD still uses order.is_paid / payment_state_code. `paymentLabel(order, delivery?)` in `lib/paymentLabel.ts` implements this; detail passes `delivery`, list merges snapshot `cod_confirmed` into order.
- **DeliverySnapshot** and delivery cache now store `cod_confirmed` / `cod_confirmed_at` so list can show correct label from cache.
- **Refetch sequence after COD confirm:** 1) fetchDriverOrderById 2) fetchDriverOrderDelivery 3) requestListRefresh(). Logged in __DEV__ as refetch 1/3, 2/3, 3/3. List screen subscribes to refreshTrigger and refetches when it changes.
- **One button:** Single "Төлбөр хүлээн авсан (COD)" for both driver and cashier; when cod_confirmed show "COD баталгаажсан: &lt;timestamp&gt;" and hide button.
- **Timeline:** status_history item with code `cod_confirmed` displays as "COD баталгаажсан".

**Test steps:**
1. Driver login → open COD order (delivered) → tap "Төлбөр хүлээн авсан (COD)".
2. Detail: Payment label shows "Төлөгдсөн"; hero "Хүргэгдсэн – Баталгаажсан"; "COD баталгаажсан: &lt;timestamp&gt;" visible; no confirm button.
3. Go back: list card for that order shows "Төлөгдсөн".
4. Console: [COD confirm] refetch 1/3, 2/3, 3/3 and order/delivery debug (payment_state_code, cod_confirmed).

---

## Regression fix: COD reverting to "Төлөгдөөгүй" after refresh (root cause + fixes)

**Root cause (4 hypotheses addressed):**

1. **Delivery parse** – Backend may return `{ success: true, data: { cod_confirmed, ... } }`; unwrap gives `data` but we now also read `cod_confirmed` from top-level and from `raw.data` in `normalizeDeliveryData`. Logs: `[DELIVERY RAW]`, `[DELIVERY PARSED]`.
2. **Cache key** – Key is always `String(order_id ?? id)`; list uses same id. Logs: `[CACHE SET] key=`, `[CACHE GET] key=`, `[LIST MERGE]`.
3. **List re-render** – List was selecting `getDelivery` (stable function ref) so it did not re-render when cache updated. **Fix:** Subscribe to `byOrderId` so any cache update re-renders list and merge runs again. When list refresh runs, we no longer overwrite cache with snapshot that lacks `cod_confirmed`: we preserve `existing?.cod_confirmed` / `cod_confirmed_at` in `setDeliverySnapshot`.
4. **COD fallback** – If delivery is missing or stale, we now treat COD as confirmed when: `order.status_history` has `code === 'cod_confirmed'`, or `order.payment?.payment_status === 'paid'`, or `order.payment?.paid === true` (in `paymentLabel`).

**Debug logs (__DEV__):**
- After COD confirm refetch: `[DELIVERY PARSED]`, refetch 1/3 status_history, 3/3 list refresh.
- Cache: `[CACHE SET] key= orderId snapshot=`.
- List: `[CACHE GET]` when snapshot has cod_confirmed; `[LIST MERGE] order id snapshot cod_confirmed=`.
- Payment: `[PAYLABEL INPUT]` with method, delivery_cod_confirmed, status_history_has_cod_confirmed, order_payment_status, etc.
