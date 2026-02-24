# Delivery-based Orders list – PR note

## How delivery status is sourced

- **Primary:** `GET /api/v1/orders/:order_id/delivery` returns `current_status.code` and `current_status.label` (source of truth).
- **List screen:** The list endpoint `GET /api/v1/mxm/orders` may not include delivery. So we:
  1. Fetch orders (first paint with cards, optional skeleton on first load).
  2. Batch-fetch delivery for the current page (e.g. first 20) via parallel `GET .../delivery` with concurrency 6.
  3. Merge results into a **delivery cache** (Zustand) keyed by `order_id`.
- **Display:** Each list item is built from `order` + `cache[order_id]`. If the list API later returns `delivery_status_code` / `delivery_status_label`, we use those when cache is missing (no extra fetch for that order).
- **Detail screen:** After `POST .../delivery/status`, the API returns the updated delivery object. We update local state and **also write to the delivery cache**, so when the user goes back to the list the order appears in the correct tab immediately (no refetch).

## Caching

- **Store:** `store/deliveryCacheStore.ts` – `byOrderId: Record<string, DeliverySnapshot>`.
- **DeliverySnapshot:** `{ code, label, last_update_at?, version? }`. Labels come from API when present, else from `constants/deliveryStatusLabels.ts` (never snake_case in UI).
- **Updates:** Cache is written when (1) batch delivery fetch completes, (2) detail screen receives response from `POST .../delivery/status`.
- **Tab filtering:** Strict: each tab shows only orders where `delivery.code === tab` (e.g. “Хүргэгдсэн” only `delivered`). “Бүгд” shows all orders. Orders without delivery (e.g. before enrichment) only appear in “Бүгд”.

## Optional backend change (performance)

To avoid N+1 and make the list instant, the list endpoint can include delivery fields per order, e.g.:

- `delivery_current_status_code` (string)
- `delivery_current_status_label` (string, Mongolian)
- `delivery_last_update_at` (string, optional)
- `delivery_version` (number or string, optional)

If present, the app uses them and can skip or reduce batch delivery fetches for that page. The frontend remains compatible with or without these fields.
