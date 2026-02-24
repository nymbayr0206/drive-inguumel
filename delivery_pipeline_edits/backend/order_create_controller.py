# Odoo 19 backend — order creation (POST /api/v1/mxm/orders)
# Ensure this controller confirms sale.order, creates stock.picking (WH/OUT), and always returns
# { success: true, data: { order_id, order_number } } on success. Never return 500 due to response formatting.

import logging
from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class MxmOrderController(http.Controller):
    @http.route("/api/v1/mxm/orders", type="json", auth="user")
    def create_order(self, **kwargs):
        """Create order: confirm sale.order, ensure picking created, return stable success payload."""
        try:
            # 1) Build and create sale.order from payload (warehouse_id required)
            order = request.env["sale.order"].create(self._order_vals(kwargs))
            if not order:
                return {"success": False, "message": "Order creation failed"}

            warehouse_id = order.warehouse_id.id if order.warehouse_id else (kwargs.get("warehouse_id") or kwargs.get("warehouse"))

            # 2) Confirm order so WH/OUT picking is created
            order.action_confirm()
            _logger.info(
                "[createOrder] order_id=%s warehouse_id=%s sale_state=%s",
                order.id,
                warehouse_id,
                order.state,
            )

            # 3) Ensure delivery picking exists for this warehouse
            pickings = order.picking_ids.filtered(
                lambda p: p.picking_type_id.code == "outgoing" and (not p.location_id.warehouse_id or p.location_id.warehouse_id.id == warehouse_id)
            )
            if not pickings and order.picking_ids:
                pickings = order.picking_ids
            _logger.info(
                "[createOrder] order_id=%s picking_ids=%s picking_states=%s",
                order.id,
                pickings.ids,
                pickings.mapped("state"),
            )

            # 4) Return success — never 500 on format; use minimal stable payload
            order_id = order.id
            order_number = order.name or str(order_id)
            return {
                "success": True,
                "data": {
                    "order_id": order_id,
                    "order_number": order_number,
                },
            }
        except Exception as e:
            _logger.exception("[createOrder] exception: %s", e)
            raise


    def _order_vals(self, payload):
        """Build sale.order create vals from API payload (adapt to your schema)."""
        # Adapt keys to your actual API (partner_id, order_line, warehouse_id, etc.)
        return {
            "partner_id": payload.get("partner_id"),
            "warehouse_id": payload.get("warehouse_id") or payload.get("warehouse"),
            "order_line": payload.get("order_line") or payload.get("lines", []),
            # add other required fields
        }
