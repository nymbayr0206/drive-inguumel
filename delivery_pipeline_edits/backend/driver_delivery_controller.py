# Odoo 19 — GET /api/v1/driver/orders/<order_id>/delivery
# Drive app uses this for delivery timeline. Same envelope as POST .../delivery/status success.
# Access: users with driver capability (driver group or admin), even if also warehouse_owner.

import json
import logging
from odoo import http
from odoo.http import request

from .auth_capabilities import user_has_driver_capability

_logger = logging.getLogger(__name__)


def _order_in_warehouse_scope(sale_order, user_warehouse_ids):
    """Check order's warehouse is in the driver's assigned warehouse list."""
    if not user_warehouse_ids:
        return False
    order_wh = sale_order.warehouse_id
    if not order_wh:
        return False
    return order_wh.id in user_warehouse_ids


def _delivery_payload_from_order(sale_order):
    """Build delivery payload: current_status, timeline, version, picking_id, picking_state, picking_ids."""
    # Reuse your existing logic (e.g. from sale.order._mxm_set_status or delivery model).
    # Example: derive current_status from stock.picking (outgoing) state.
    picking = None
    pickings = sale_order.picking_ids.filtered(
        lambda p: p.picking_type_id.code == "outgoing"
    )
    if pickings:
        picking = pickings[0]
    picking_id = picking.id if picking else None
    picking_state = picking.state if picking else None
    picking_ids = sale_order.picking_ids.ids if sale_order.picking_ids else []

    # Build current_status and timeline from your delivery log / picking state
    current_status = {"code": "received", "label": "Received", "at": None}
    timeline = []
    version = 1
    if picking:
        state_to_code = {
            "draft": "received",
            "waiting": "preparing",
            "confirmed": "preparing",
            "assigned": "prepared",
            "done": "delivered",
            "cancel": "cancelled",
        }
        current_status["code"] = state_to_code.get(picking.state, "received")
        current_status["label"] = picking.state or ""

    return {
        "order_id": sale_order.id,
        "current_status": current_status,
        "timeline": timeline,
        "version": version,
        "last_update_at": None,
        "picking_id": picking_id,
        "picking_state": picking_state,
        "picking_ids": picking_ids,
    }


class DriverDeliveryController(http.Controller):
    @http.route(
        "/api/v1/driver/orders/<int:order_id>/delivery",
        type="http",
        auth="user",
        methods=["GET"],
        csrf=False,
    )
    def get_driver_order_delivery(self, order_id, **kwargs):
        """GET /api/v1/driver/orders/<order_id>/delivery
        Check order exists, driver capability, warehouse scope, return delivery payload.
        """
        env = request.env
        user = env.user
        if not user_has_driver_capability(env, user):
            return request.make_response(
                json.dumps({"success": False, "code": "FORBIDDEN", "message": "Driver access required"}),
                headers=[("Content-Type", "application/json")],
                status=403,
            )

        order = env["sale.order"].sudo().browse(order_id)
        if not order.exists():
            return request.make_response(
                json.dumps({"success": False, "code": "NOT_FOUND", "message": "Order not found"}),
                headers=[("Content-Type", "application/json")],
                status=404,
            )

        warehouse_ids = getattr(user, "warehouse_ids", None) or getattr(user, "x_warehouse_ids", None) or []
        if hasattr(warehouse_ids, "ids"):
            warehouse_ids = warehouse_ids.ids
        elif not isinstance(warehouse_ids, (list, tuple)):
            warehouse_ids = []
        if not _order_in_warehouse_scope(order, warehouse_ids):
            return request.make_response(
                json.dumps({"success": False, "code": "FORBIDDEN", "message": "Order not in your warehouse scope"}),
                headers=[("Content-Type", "application/json")],
                status=403,
            )

        payload = _delivery_payload_from_order(order)
        _logger.info("[driver/orders/delivery GET] order_id=%s picking_id=%s", order_id, payload.get("picking_id"))
        return request.make_response(
            json.dumps({"success": True, "code": "OK", "data": payload}),
            headers=[("Content-Type", "application/json")],
        )
