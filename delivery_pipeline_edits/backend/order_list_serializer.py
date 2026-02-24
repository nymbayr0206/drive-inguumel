# Odoo 19 backend — GET /api/v1/mxm/orders and GET /api/v1/drive/orders
# Each list item MUST include: order_id, order_number, date_order, state,
# delivery_status_code, delivery_status_label_mn (optional), is_delivered, is_cancelled.
# Single source of truth: delivery_status_code. No N+1.

import logging
from odoo import models

_logger = logging.getLogger(__name__)

DELIVERY_STATUS_CODES = [
    "received",
    "preparing",
    "prepared",
    "out_for_delivery",
    "delivered",
    "cancelled",
]
DELIVERY_LABELS_MN = {
    "received": "Захиалга авлаа",
    "preparing": "Бэлтгэж байна",
    "prepared": "Бэлтгэж дууссан",
    "out_for_delivery": "Хүргэлтэд гарсан",
    "delivered": "Хүргэгдсэн",
    "cancelled": "Цуцлагдсан",
}


def _picking_to_delivery_status_code(picking):
    """Map stock.picking (WH/OUT) to delivery_status_code. Single place for logic."""
    if not picking:
        return "received"
    state = (picking.state or "").lower()
    if state == "cancel":
        return "cancelled"
    if state == "done":
        return "delivered"
    if state == "assigned":
        # Optionally check if driver/carrier assigned
        return "out_for_delivery"
    if state in ("confirmed", "waiting", "partially_available"):
        return "prepared"
    return "preparing"


def _order_delivery_status(sale_order):
    """Derive delivery_status_code from sale.order and its pickings. No extra queries per order."""
    if (sale_order.state or "").lower() == "cancel":
        return "cancelled", DELIVERY_LABELS_MN.get("cancelled", "Цуцлагдсан")
    picking = sale_order.picking_ids.filtered(lambda p: p.picking_type_id.code == "outgoing")
    picking = picking[0] if picking else None
    code = _picking_to_delivery_status_code(picking)
    label = DELIVERY_LABELS_MN.get(code, code)
    return code, label


def serialize_order_for_list(sale_order):
    """One dict per order with delivery_status_code populated. Use in list endpoints."""
    code, label_mn = _order_delivery_status(sale_order)
    return {
        "order_id": sale_order.id,
        "order_number": sale_order.name,
        "date_order": sale_order.date_order.isoformat() if sale_order.date_order else None,
        "state": sale_order.state,
        "delivery_status_code": code,
        "delivery_status_label_mn": label_mn,
        "is_delivered": code == "delivered",
        "is_cancelled": code == "cancelled",
        "amount_total": sale_order.amount_total,
        "partner_id": sale_order.partner_id.id,
        "warehouse_id": sale_order.warehouse_id.id if sale_order.warehouse_id else None,
        # add other list fields
    }


# In your list controller (GET /api/v1/mxm/orders and GET /api/v1/drive/orders):
# - Query sale.order with prefetch: .with_context(prefetch_fields=['picking_ids', 'picking_ids.state', ...])
# - For each order call serialize_order_for_list(order) so every item has delivery_status_code.
# - Log: _logger.info("[listOrders] count=%s with_delivery_code=%s", len(orders), sum(1 for o in orders if o.get('delivery_status_code')))
