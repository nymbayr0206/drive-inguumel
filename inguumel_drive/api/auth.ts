import type {
  Capabilities,
  LoginPayload,
  LoginResponse,
  LoginResponseEnvelope,
} from '@/types/api';
import { config } from '@/config/env';
import client from './client';
import { API_PATHS } from './paths';

function safeLog(label: string, body: unknown, requestId?: string) {
  const payload: Record<string, unknown> = { loginResponse: body };
  if (requestId) payload.request_id = requestId;
  // eslint-disable-next-line no-console
  console.log(`[Login ${label}]`, JSON.stringify(payload));
}

/**
 * POST /api/v1/auth/login (Odoo 19 API)
 * Body: { phone (8 digits), pin (6 digits) }
 * Success: { success: true, data: { uid, partner_id, access_token, expires_in, role, warehouse_ids } }
 */
export async function login(payload: LoginPayload): Promise<LoginResponse> {
  try {
    const headers: Record<string, string> = {};
    if (config.appContext === 'driver') headers['X-App'] = 'driver';
    else if (config.appContext === 'cashier') headers['X-App'] = 'cashier';
    const res = await client.post<LoginResponseEnvelope>(API_PATHS.AUTH_LOGIN, payload, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
    const envelope = res.data;
    const requestId =
      envelope?.request_id ?? (res.headers?.['x-request-id'] as string | undefined);

    if (envelope?.success === true && envelope?.data) {
      safeLog('success', envelope, requestId);
      const d = envelope.data;
      const warehouseIds = Array.isArray(d.warehouse_ids)
        ? d.warehouse_ids.map((id) => String(id))
        : [];
      const caps = d.capabilities as Capabilities | undefined;
      const roles = Array.isArray(d.roles) ? d.roles : [];
      return {
        access_token: d.access_token,
        uid: d.uid,
        partner_id: d.partner_id,
        role: d.role,
        warehouse_ids: warehouseIds,
        capabilities: caps,
        roles,
        primary_role: d.primary_role,
      };
    }

    safeLog('failure', envelope ?? res.data, requestId);
    throw new Error(
      (envelope as { message?: string })?.message ?? 'Login failed'
    );
  } catch (err: unknown) {
    const axiosErr = err as {
      response?: { data?: { request_id?: string }; headers?: { 'x-request-id'?: string } };
    };
    const body = axiosErr?.response?.data;
    const requestId =
      (body && typeof body === 'object' && 'request_id' in body
        ? (body as { request_id?: string }).request_id
        : undefined) ?? axiosErr?.response?.headers?.['x-request-id'];
    safeLog('error', body ?? err, requestId);
    throw err;
  }
}

/** Drive app: only warehouse_owner may use the app */
export function isDeniedRole(role: string): boolean {
  return role === 'customer';
}

/** Allow if user has any capability or allowed role with warehouses. Prefer capabilities; fallback to role. */
export function isDriveStaff(data: LoginResponse): boolean {
  const hasWarehouse =
    Array.isArray(data.warehouse_ids) && data.warehouse_ids.length > 0;
  if (!hasWarehouse) return false;
  const caps = data.capabilities;
  if (caps?.can_driver_update_delivery_status || caps?.can_cash_confirm || caps?.can_manage_warehouse)
    return true;
  const role = data.primary_role ?? data.role;
  return ['warehouse_owner', 'driver', 'delivery_staff', 'cashier', 'admin'].includes(role);
}

/** Has drive/cashier capability but no warehouses assigned → show "No warehouses assigned" */
export function hasNoWarehouseAssigned(data: LoginResponse): boolean {
  const hasCap =
    data.capabilities?.can_driver_update_delivery_status ||
    data.capabilities?.can_cash_confirm ||
    data.capabilities?.can_manage_warehouse;
  const role = data.primary_role ?? data.role;
  const hasAllowedRole = ['warehouse_owner', 'driver', 'delivery_staff', 'cashier', 'admin'].includes(role);
  return (hasCap || hasAllowedRole) && (!Array.isArray(data.warehouse_ids) || data.warehouse_ids.length === 0);
}
