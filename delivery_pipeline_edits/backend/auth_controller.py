# Odoo 19 — Login API: extend response with primary_role, roles, capabilities.
# Use auth_capabilities for role resolution. App context from X-App header or ?app=.

import json
import logging
from odoo import http
from odoo.http import request

from .auth_capabilities import (
    get_capabilities,
    get_primary_role,
    get_roles_from_user,
    get_warehouse_ids,
)

_logger = logging.getLogger(__name__)


def get_app_context(request) -> str | None:
    """X-App: driver | cashier, or query ?app=driver|cashier. Lowercase."""
    app = request.httprequest.headers.get("X-App")
    if app:
        return app.strip().lower() or None
    app = request.httprequest.args.get("app")
    if app:
        return app.strip().lower() or None
    return None


def build_login_user_payload(env, user, app_context: str | None) -> dict:
    """
    Build { role, primary_role, roles, capabilities, warehouse_ids } for login/me response.
    - role: kept for backward compat (may be warehouse_owner when user has multiple groups).
    - primary_role: driver | cashier | warehouse_owner | admin | staff | customer (respects app context).
    - roles: list of all roles from group membership.
    - capabilities: { can_driver_update_delivery_status, can_cash_confirm, can_manage_warehouse }.
    """
    roles = get_roles_from_user(env, user)
    capabilities = get_capabilities(roles)
    primary_role = get_primary_role(roles, app_context)
    # Legacy single role: use primary_role so driver+cashier see correct default
    role = primary_role
    warehouse_ids = get_warehouse_ids(user)
    return {
        "role": role,
        "primary_role": primary_role,
        "roles": roles,
        "capabilities": capabilities,
        "warehouse_ids": warehouse_ids,
    }


def get_user_from_credentials(env, phone: str, pin: str):
    """
    Resolve user from phone + PIN. Override in your module if you use partner.phone + custom pin.
    Default: look up res.users by partner_id.phone (normalized) and validate pin (e.g. custom field).
    Return request.env['res.users'] record or None.
    """
    phone = (phone or "").strip()
    pin = (pin or "").strip()
    if not phone or not pin:
        return None
    # Example: partner with mobile = phone; user linked to partner; pin on user or partner
    User = env["res.users"]
    Partner = env["res.partner"]
    partners = Partner.sudo().search([("mobile", "=", phone)], limit=1)
    if not partners:
        partners = Partner.sudo().search([("phone", "=", phone)], limit=1)
    if not partners:
        return None
    user = User.sudo().search([("partner_id", "=", partners[0].id)], limit=1)
    if not user:
        return None
    # PIN check: if you have a custom field like user.x_pin or partner.x_pin, use it here
    pin_field = getattr(user, "x_pin", None) or getattr(partners[0], "x_pin", None)
    if pin_field is not None and str(pin_field).strip() != pin:
        return None
    return user


def create_access_token_for_user(env, user):
    """
    Create or return access token for API auth. Override if you use api_key or custom token model.
    Return str token. Default: use Odoo API key if available, else placeholder (you must implement).
    """
    # If using Odoo 19 API keys: user.api_key_ids[0].key or generate
    if hasattr(user, "api_key_ids") and user.api_key_ids:
        return user.api_key_ids[0].key
    # Placeholder: in production, create a token in your custom model and return it
    _logger.warning("auth_controller: no api_key on user %s; using placeholder token", user.id)
    return f"odoo_user_{user.id}"


class AuthController(http.Controller):
    """
    POST /api/v1/auth/login
    Body: { phone, pin }
    Header: X-App (optional): driver | cashier
    Query: app= (optional): driver | cashier
    Response: {
      success: true,
      data: {
        uid, partner_id, access_token, expires_in,
        role, primary_role, roles, capabilities, warehouse_ids
      }
    }
    """

    @http.route("/api/v1/auth/login", type="json", auth="none", methods=["POST"], csrf=False)
    def login(self, **kwargs):
        # JSON body: phone, pin (or from kwargs)
        body = request.jsonrequest or {}
        phone = body.get("phone") or kwargs.get("phone") or ""
        pin = body.get("pin") or kwargs.get("pin") or ""
        app_context = get_app_context(request)
        env = request.env
        user = get_user_from_credentials(env, str(phone).strip(), str(pin).strip())
        if not user:
            return {"success": False, "code": "INVALID_CREDENTIALS", "message": "Invalid phone or PIN"}
        token = create_access_token_for_user(env, user)
        payload = build_login_user_payload(env, user, app_context)
        payload["uid"] = user.id
        payload["partner_id"] = user.partner_id.id
        payload["access_token"] = token
        payload["expires_in"] = 86400
        _logger.info(
            "[auth/login] uid=%s primary_role=%s roles=%s app_context=%s",
            user.id,
            payload.get("primary_role"),
            payload.get("roles"),
            app_context,
        )
        return {"success": True, "code": "OK", "data": payload}
