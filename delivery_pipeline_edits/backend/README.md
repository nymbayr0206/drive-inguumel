# Backend (Odoo 19) — how to apply

1. **Order creation** (`order_create_controller.py`)
   - Ensure POST `/api/v1/mxm/orders` confirms `sale.order` and returns `{ success: true, data: { order_id, order_number } }` even if response formatting would otherwise fail.
   - Adapt `_order_vals` to your real payload (partner_id, order_line, warehouse_id, etc.).

2. **List serializer** (`order_list_serializer.py`)
   - Use `serialize_order_for_list(sale_order)` in both GET `/api/v1/mxm/orders` and GET `/api/v1/drive/orders` so every item has `delivery_status_code`, `delivery_status_label_mn`, `is_delivered`, `is_cancelled`.
   - Ensures no N+1: status is derived from `sale_order.picking_ids` in one pass.

3. **Drive orders** (`drive_orders_controller.py`)
   - GET `/api/v1/drive/orders?warehouse_id=&status=&limit=&offset=` — driver list; filter by `delivery_status_code` in Python (status not on model by default).
   - POST `/api/v1/drive/orders/<id>/status` with body `{ code }` — implement mapping from `code` to picking state or your delivery timeline model; return same shape as GET `/api/v1/orders/<id>/delivery`.

4. **MXM list controller**
   - In your existing GET `/api/v1/mxm/orders` controller, replace raw dict build with:
     `items = [serialize_order_for_list(o) for o in orders]`
   - Log: `_logger.info("[listOrders] count=%s with_delivery_code=%s", len(items), sum(1 for i in items if i.get("delivery_status_code")))`
