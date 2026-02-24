# Odoo 19 — Role and capabilities from group membership.
# No broad fallback that hides driver/cashier. Used by auth controller and driver/cashier endpoints.

import logging
from collections.abc import Iterable

_logger = logging.getLogger(__name__)

# Group XML IDs (inguumel_order_mxm or your module name)
GROUP_SYSTEM = "base.group_system"
GROUP_DRIVER = "inguumel_order_mxm.group_driver"
GROUP_CASH_CONFIRM = "inguumel_order_mxm.group_cash_confirm"
GROUP_WAREHOUSE_OWNER = "inguumel_order_mxm.group_warehouse_owner"
GROUP_STOCK_USER = "stock.group_stock_user"
GROUP_USER = "base.group_user"

# Priority for default primary_role when no app context: admin > cashier > driver > warehouse_owner > staff > customer
PRIMARY_ROLE_PRIORITY = ("admin", "cashier", "driver", "warehouse_owner", "staff", "customer")


def user_has_group(env, user, xml_id: str) -> bool:
    """Safe has_group check; returns False if group does not exist."""
    try:
        return user.has_group(xml_id)
    except Exception as e:
        _logger.warning("auth_capabilities: has_group %s failed: %s", xml_id, e)
        return False


def get_roles_from_user(env, user) -> list[str]:
    """
    Determine roles from group membership only. No broad fallback that hides driver/cashier.
    - admin: base.group_system
    - driver: inguumel_order_mxm.group_driver
    - cashier: inguumel_order_mxm.group_cash_confirm
    - warehouse_owner: inguumel_order_mxm.group_warehouse_owner OR user has x_warehouse_ids set
    - staff: stock.group_stock_user OR base.group_user (and not any of the above)
    - customer: else
    """
    roles = []
    if user_has_group(env, user, GROUP_SYSTEM):
        roles.append("admin")
    if user_has_group(env, user, GROUP_DRIVER):
        roles.append("driver")
    if user_has_group(env, user, GROUP_CASH_CONFIRM):
        roles.append("cashier")
    # warehouse_owner: group or has warehouse_ids
    if user_has_group(env, user, GROUP_WAREHOUSE_OWNER):
        roles.append("warehouse_owner")
    else:
        warehouse_ids = getattr(user, "warehouse_ids", None) or getattr(user, "x_warehouse_ids", None)
        if warehouse_ids:
            ids = getattr(warehouse_ids, "ids", None) or (warehouse_ids if isinstance(warehouse_ids, (list, tuple)) else [])
            if ids:
                roles.append("warehouse_owner")
    if user_has_group(env, user, GROUP_STOCK_USER) or user_has_group(env, user, GROUP_USER):
        if "staff" not in roles:
            roles.append("staff")
    if not roles:
        roles.append("customer")
    return roles


def get_capabilities(roles: Iterable[str]) -> dict[str, bool]:
    """
    Canonical source for UI. Booleans used for button visibility.
    - can_driver_update_delivery_status: driver (or admin)
    - can_cash_confirm: cashier (or admin)
    - can_manage_warehouse: warehouse_owner (or admin)
    """
    r = set(roles) if roles else set()
    admin = "admin" in r
    return {
        "can_driver_update_delivery_status": admin or "driver" in r,
        "can_cash_confirm": admin or "cashier" in r,
        "can_manage_warehouse": admin or "warehouse_owner" in r,
    }


def get_primary_role(roles: Iterable[str], app_context: str | None) -> str:
    """
    primary_role selection:
    - If app_context == "driver" and user has driver capability -> "driver"
    - If app_context == "cashier" and user has cashier capability -> "cashier"
    - Else default priority: admin > cashier > driver > warehouse_owner > staff > customer
    """
    r = list(roles) if roles else []
    if not r:
        return "customer"
    if app_context == "driver" and "driver" in r:
        return "driver"
    if app_context == "cashier" and "cashier" in r:
        return "cashier"
    for role in PRIMARY_ROLE_PRIORITY:
        if role in r:
            return role
    return r[0]


def get_warehouse_ids(user) -> list[int]:
    """Return list of warehouse IDs for the user (warehouse_ids or x_warehouse_ids)."""
    wh = getattr(user, "warehouse_ids", None) or getattr(user, "x_warehouse_ids", None)
    if not wh:
        return []
    if hasattr(wh, "ids"):
        return wh.ids
    if isinstance(wh, (list, tuple)):
        return [int(x) for x in wh if x is not None]
    return []


def user_has_driver_capability(env, user) -> bool:
    """True if user is allowed to use driver endpoints (update delivery status)."""
    roles = get_roles_from_user(env, user)
    caps = get_capabilities(roles)
    return caps.get("can_driver_update_delivery_status", False)


def user_has_cash_confirm_capability(env, user) -> bool:
    """True if user is allowed to call cash-confirm."""
    roles = get_roles_from_user(env, user)
    caps = get_capabilities(roles)
    return caps.get("can_cash_confirm", False)
