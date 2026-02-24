# Reliable “Delivered” flow — code diff summary + manual test

## Goal

When the driver marks an order as delivered, the app:

- (a) Ensures the backend actually accepted it  
- (b) Uses a real delivery payload (not stub)  
- (c) Refreshes UI from source of truth (GET) after update  
- Prevents “success toast but stock not deducted” situations.

---

## 1. Code changes

### `api/orders.ts`

- **Added** `refetchOrderAndDelivery(orderId: string): Promise<{ order: OrderDetail; delivery: DeliveryInfo }>`  
  - Calls `fetchOrderById(orderId)` and `fetchOrderDelivery(orderId)` in parallel.  
  - Used after POST status update to reconcile UI from GET (order detail + delivery).

### `components/DeliveryTimeline.tsx`

- **Removed** trusting POST response: no `onUpdated(postResponse)` after POST.  
- **Added** required prop `refetchSourceOfTruth: () => Promise<{ delivery: DeliveryInfo | null }>`.  
- **Flow after POST success:**  
  1. Call `refetchSourceOfTruth()` (GET order + GET delivery).  
  2. If refetch throws: show “Сервер баталгаажуулж дуусаагүй байна. Дахин шалгаж байна…”, retry GET up to 3 times with backoff (2s, 5s, 10s).  
  3. If refetch succeeds but for `delivered` the payload is not confirmed (stub or wrong code): same warning + retry GET 3 times with backoff.  
  4. If after retries still not delivered: show “Хүргэлтийн төлөв сервер дээр баталгаажаагүй байна. Захиалгыг үлдээгээрэй.”, set “needs attention”, update UI from last GET (do not show delivered).  
  5. Otherwise: `onUpdated(refetchedDelivery)` and success toast.  
- **Delivered check:** `isDeliveredConfirmed(delivery)` — `current_status.code === 'delivered'` and label not stub (`!== ''` and `!== '...'`).  
- **Offline / POST failure:**  
  - No optimistic update; on error revert to previous delivery.  
  - Show “Дахин оролдох” button; on press retry same status.  
  - On network/server error (status 0 or ≥500), add `(orderId, code)` to pending queue (AsyncStorage).  
- **Endpoint selection:** unchanged — POST `/api/v1/drive/orders/:id/status` first; 404/501 fallback to POST `/api/v1/orders/:id/delivery/status` with `{ status: code }`.  
- **UI:** Banners for “verifying” (yellow) and “needs attention” (red); retry button when POST failed.

### `screens/OrderDetailScreen.tsx`

- **Added** `refetchSourceOfTruth` callback:  
  - Calls `refetchOrderAndDelivery(orderId)`, then `setOrder`, `setDelivery`, `setDeliveryFromCache`, returns `{ delivery }`.  
- **Passed** `refetchSourceOfTruth` into `DeliveryTimeline`.

### `store/pendingDeliveryStore.ts` (new)

- **Storage key:** `@inguumel_drive_pending_delivery`.  
- **Shape:** `Array<{ orderId, code, timestamp }>`.  
- **API:**  
  - `addPendingDelivery(orderId, code)`  
  - `getPendingDeliveries()`  
  - `removePendingDelivery(orderId)`  
  - `processPendingDeliveryQueue()`: for each pending item, call drive status POST (with fallback); on success remove from queue.

### `app/_layout.tsx`

- After `hydrate()`, call `processPendingDeliveryQueue()` once.  
- Subscribe to `AppState` `change`; when state is `active`, call `processPendingDeliveryQueue()` (e.g. app launch / return from background when network may be back).

---

## 2. Manual test

1. **Mark delivered → refetch → show delivered only if GET confirms**  
   - Open an order in “Хүргэлтэд гарсан”.  
   - Tap “Хүргэгдсэн”, confirm.  
   - **Expect:** Loading, then either:  
     - Success toast and UI shows “Хүргэгдсэн” only if GET `/api/v1/orders/:id/delivery` returns `current_status.code === 'delivered'` and non-stub label.  
     - If backend returns stub or not delivered: yellow “Сервер баталгаажуулж дуусаагүй байна. Дахин шалгаж байна…”, then after 2s/5s/10s retries either success or red “Хүргэлтийн төлөв сервер дээр баталгаажаагүй байна. Захиалгыг үлдээгээрэй.” and order stays in list (not hidden).  
2. **POST fails (e.g. airplane mode)**  
   - Turn off network, tap “Хүргэгдсэн”, confirm.  
   - **Expect:** Error alert, “Дахин оролдох” button; no optimistic delivered. Tap “Дахин оролдох” (with network on) to retry.  
3. **Queue on launch**  
   - With network off, tap “Хүргэгдсэн” (so POST fails and item is added to pending).  
   - Close app or background, turn network on, open app.  
   - **Expect:** Pending item is sent when app becomes active; order can be refreshed to show delivered if backend accepted it.

---

## 3. Endpoints (recap)

| Action              | Endpoint                                      |
|---------------------|-----------------------------------------------|
| Set status (primary)| POST `/api/v1/drive/orders/:id/status` `{ code }` |
| Set status (fallback)| POST `/api/v1/orders/:id/delivery/status` `{ status }` |
| Refetch order       | GET `/api/v1/mxm/orders/:id`                  |
| Refetch delivery    | GET `/api/v1/orders/:id/delivery`             |

UI is always updated from the GET responses after a successful POST.
