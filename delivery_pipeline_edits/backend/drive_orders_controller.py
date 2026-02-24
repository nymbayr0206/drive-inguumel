# Odoo 19 backend — GET /api/v1/drive/orders and POST /api/v1/drive/orders/<id>/status
# Drivers list orders by warehouse_id and optional status (delivery_status_code). Newest first. Pagination.

import logging
from odoo import http
from odoo.http import request

from .order_list_serializer import serialize_order_for_list

_logger = logging.getLogger(__name__)


class DriveOrdersController(http.Controller):
    @http.route("/api/v1/drive/orders", type="json", auth="user")
    def list_drive_orders(self, warehouse_id=None, status=None, limit=20, offset=0, **kwargs):
        """GET /api/v1/drive/orders?warehouse_id=&status=&limit=&offset=
        Returns orders for drivers; filter by delivery_status_code when status is set.
        Newest first. Exclude cancelled unless status=cancelled.
        """
        if not warehouse_id:
            return {"success": False, "message": "warehouse_id required"}
        domain = [
            ("warehouse_id", "=", int(warehouse_id)),
        ]
        # Fetch more if filtering by status in Python (delivery_status_code from pickings)
        fetch_limit = int(limit) * 3 if status else int(limit)
        orders = (
            request.env["sale.order"]
            .search(domain, order="date_order desc, id desc", limit=fetch_limit, offset=int(offset))
        )
        results = []
        for order in orders:
            item = serialize_order_for_list(order)
            code = item.get("delivery_status_code") or "received"
            if status and code != status:
                continue
            if not status and code == "cancelled":
                continue
            results.append(item)
            if len(results) >= int(limit):
                break
        _logger.info("[drive/orders list] count=%s warehouse_id=%s status=%s", len(results), warehouse_id, status)
        return {"success": True, "data": results, "results": results}

    @http.route("/api/v1/drive/orders/<int:order_id>/status", type="json", auth="user", methods=["POST"])
    def update_drive_order_status(self, order_id, code=None, **kwargs):
        """POST body: { code: "out_for_delivery" | "delivered" | "cancelled" | ... }
        Updates delivery status (e.g. stock.picking state or your delivery timeline model).
        Returns full delivery payload for the order.
        """
        order = request.env["sale.order"].browse(order_id).exists()
        if not order:
            return {"success": False, "message": "Order not found"}
        code = code or (kwargs.get("code") or request.jsonrequest.get("code"))
        if not code:
            return {"success": False, "message": "code required"}
        code = str(code).strip().lower()
        # Map code to picking state or your timeline model
        # Example: if code == 'delivered': order.picking_ids.filtered(...).button_validate()
        # Example: if code == 'cancelled': order.action_cancel()
        # Then return GET /api/v1/orders/<id>/delivery payload
        delivery_payload = get_order_delivery_payload(order)  # implement to match GET .../delivery
        _logger.info("[drive/orders status] order_id=%s code=%s", order_id, code)
        return {"success": True, "data": delivery_payload}


def get_order_delivery_payload(sale_order):
    """Return same shape as GET /api/v1/orders/<id>/delivery (current_status, timeline, version)."""
    return {
        "order_id": str(sale_order.id),
        "current_status": {"code": "...", "label": "...", "at": "..."},
        "timeline": [],
        "version": 1,
    }
