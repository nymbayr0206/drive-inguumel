# Delivery pipeline — verification plan

## 1) Backend: Create order returns `order_id`

```bash
export BASE="https://your-odoo.example.com"
export TOKEN="your_bearer_token"

# Create order (adapt body to your API)
curl -s -X POST "$BASE/api/v1/mxm/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"warehouse_id": 1, "partner_id": 1, "order_line": []}' | jq .
```

**Expected:** `{ "success": true, "data": { "order_id": 123, "order_number": "S00123" } }`  
**Check:** No 500 when order is created; WH/OUT picking appears in Odoo Delivery (Inventory → Operations → Delivery Orders).

---

## 2) Backend: List orders include `delivery_status_code`

```bash
curl -s "$BASE/api/v1/mxm/orders?warehouse_id=1&limit=5&offset=0" \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | {order_id, order_number, delivery_status_code}'
# or if wrapped: jq '.data[] | {order_id, order_number, delivery_status_code}'
```

**Expected:** Every item has `delivery_status_code` (e.g. `received`, `preparing`, `delivered`, `cancelled`).

---

## 3) Odoo UI: Picking created and visible

- After step 1, open Odoo: **Inventory → Operations → Delivery Orders** (or equivalent WH/OUT view).
- Filter by the order’s warehouse.
- Confirm the new order’s delivery (stock picking) appears and is not cancelled.

---

## 4) Customer app: Checkout → success → cart empty → order in correct tab

1. Add items to cart, go to checkout.
2. Press **«Захиалга баталгаажуулах»**.
3. **Expected:** Loading on button, then success banner; cart is empty; navigated to Orders (or order detail).
4. Open **Orders** list: new order appears in **Идэвхтэй** (or **Бүгд**); tab filter uses `delivery_status_code` only.
5. If backend returns error/malformed 2xx: app runs fallback (newest orders within 2 min); if a match is found, still success + clear cart; else show «Алдаа гарлаа. Дахин оролдоно уу.» and do **not** clear cart.

---

## 5) Drive app: Refresh + poll → new order appears → status updates

1. **List:** Pull-to-refresh; wait or switch tab and return — list should refetch (poll every 30s when focused).
2. Create a new order from customer app (step 4); in Drive app do **pull-to-refresh** (or wait up to 30s).
3. **Expected:** New order appears in the correct tab (e.g. «Захиалга авлаа» / received).
4. In Drive app open the order; tap e.g. «Хүргэлтэд гарсан» then «Хүргэгдсэн».
5. **Expected:** Optimistic update in UI; on success toast «Төлөв шинэчлэгдлээ.»; on failure rollback and Mongolian error.
6. In customer app, open Orders: that order should now show in **Хүргэгдсэн** with correct progress dots (all green).

---

## Quick checklist

| Step | What to verify |
|------|----------------|
| 1 | `curl` create → 200 + `data.order_id` + `data.order_number` |
| 2 | `curl` list → each element has `delivery_status_code` |
| 3 | Odoo Delivery view shows new WH/OUT for the order’s warehouse |
| 4 | Customer: checkout → success banner → cart empty → order in list in correct tab |
| 5 | Drive: refresh/poll shows new order; status update reflects in Drive and Customer tabs/dots |
