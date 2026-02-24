import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { setAuthToken } from '@/api/client';
import { secureStorage } from '@/lib/secureStorage';
import type { Capabilities } from '@/types/api';

const TOKEN_KEY = 'inguumel_drive_token';
const AUTH_DATA_KEY = '@inguumel_drive_auth';

export interface AuthData {
  access_token: string;
  uid: string;
  partner_id: string;
  role: string;
  warehouse_ids: string[];
  /** Canonical; prefer for button visibility. */
  capabilities?: Capabilities;
  /** Fallback; list of roles from group membership. */
  roles?: string[];
  /** Fallback; primary role when app context given. */
  primary_role?: string;
}

/** Drive app: warehouse_owner, driver, cashier may enter. No /me call – hydrate from storage only. */
const ALLOWED_ROLES = ['warehouse_owner', 'driver', 'delivery_staff', 'cashier', 'admin'];

export function isAllowedRole(role: string): boolean {
  return ALLOWED_ROLES.includes(role);
}

/** True if user can update delivery status (driver buttons). Prefer capabilities; fallback to role. */
export function canDriverUpdateDeliveryStatus(
  capabilities: Capabilities | null,
  role: string | null
): boolean {
  if (capabilities?.can_driver_update_delivery_status === true) return true;
  return ['driver', 'delivery_staff', 'warehouse_owner', 'admin'].includes(role ?? '');
}

/** True if user can cash confirm (COD). Prefer capabilities; fallback to role. */
export function canCashConfirm(
  capabilities: Capabilities | null,
  role: string | null
): boolean {
  if (capabilities?.can_cash_confirm === true) return true;
  return role === 'cashier' || role === 'admin';
}

/** True if user can see COD confirm button (driver/cashier/warehouse). Used for driver COD + cashier cash-confirm. */
export function canShowCodConfirm(
  capabilities: Capabilities | null,
  role: string | null
): boolean {
  if (capabilities?.can_cash_confirm === true) return true;
  const r = (role ?? '').toLowerCase();
  return ['driver', 'delivery_staff', 'warehouse_owner', 'cashier', 'admin'].includes(r);
}

/** True if user can manage warehouse (all next_actions visible). Prefer capabilities. */
export function canManageWarehouse(
  capabilities: Capabilities | null,
  role: string | null
): boolean {
  if (capabilities?.can_manage_warehouse === true) return true;
  return role === 'warehouse_owner' || role === 'admin';
}

export function hasWarehouseAccess(warehouseIds: string[] | undefined | null): boolean {
  return Array.isArray(warehouseIds) && warehouseIds.length > 0;
}

interface AuthState {
  token: string | null;
  uid: string | null;
  partnerId: string | null;
  role: string | null;
  /** Canonical capabilities; prefer for UI. */
  capabilities: Capabilities | null;
  /** Fallback roles from backend. */
  roles: string[];
  /** Fallback primary role. */
  primaryRole: string | null;
  warehouseIds: string[];
  selectedWarehouseId: string | null;
  hydrated: boolean;
  isBlocked: boolean;
  /** Shown on login screen when redirected due to 401. */
  sessionExpiredMessage: string | null;
  setAuth: (data: AuthData | null) => void;
  setBlocked: (blocked: boolean) => void;
  setSelectedWarehouseId: (id: string | null) => void;
  setSessionExpired: (message: string | null) => void;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
  persistAuth: (data: AuthData) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  uid: null,
  partnerId: null,
  role: null,
  capabilities: null,
  roles: [],
  primaryRole: null,
  warehouseIds: [],
  selectedWarehouseId: null,
  hydrated: false,
  isBlocked: false,
  sessionExpiredMessage: null,

  setAuth(data) {
    if (!data) {
      setAuthToken(null);
      set({
        token: null,
        uid: null,
        partnerId: null,
        role: null,
        capabilities: null,
        roles: [],
        primaryRole: null,
        warehouseIds: [],
        selectedWarehouseId: null,
        isBlocked: false,
      });
      return;
    }
    setAuthToken(data.access_token);
    const firstWarehouse = data.warehouse_ids?.[0] ?? null;
    set({
      token: data.access_token,
      uid: data.uid,
      partnerId: data.partner_id,
      role: data.role,
      capabilities: data.capabilities ?? null,
      roles: data.roles ?? [],
      primaryRole: data.primary_role ?? null,
      warehouseIds: data.warehouse_ids ?? [],
      selectedWarehouseId: get().selectedWarehouseId ?? firstWarehouse,
      isBlocked: false,
    });
  },

  setBlocked(blocked) {
    set({ isBlocked: blocked });
  },

  setSelectedWarehouseId(id) {
    set({ selectedWarehouseId: id });
  },

  setSessionExpired(message) {
    set({ sessionExpiredMessage: message });
  },

  /** Load token + persisted auth from storage. Use capabilities/roles/primary_role; fallback to role. No /me API call. */
  async hydrate() {
    try {
      const token = await secureStorage.getItem(TOKEN_KEY);
      if (!token) {
        set({ hydrated: true });
        return;
      }
      const raw = await AsyncStorage.getItem(AUTH_DATA_KEY);
      if (!raw) {
        await get().logout();
        set({ hydrated: true });
        return;
      }
      const data = JSON.parse(raw) as AuthData;
      const allowed =
        isAllowedRole(data.role) ||
        (Array.isArray(data.roles) && data.roles.length > 0) ||
        (data.primary_role && data.primary_role !== 'customer') ||
        (data.capabilities &&
          (data.capabilities.can_driver_update_delivery_status ||
            data.capabilities.can_cash_confirm ||
            data.capabilities.can_manage_warehouse));
      if (!allowed || !hasWarehouseAccess(data.warehouse_ids)) {
        await get().logout();
        set({ hydrated: true });
        return;
      }
      setAuthToken(token);
      const firstWarehouse = data.warehouse_ids?.[0] ?? null;
      set({
        token,
        uid: data.uid,
        partnerId: data.partner_id,
        role: data.role,
        capabilities: data.capabilities ?? null,
        roles: data.roles ?? [],
        primaryRole: data.primary_role ?? null,
        warehouseIds: data.warehouse_ids ?? [],
        selectedWarehouseId: get().selectedWarehouseId ?? firstWarehouse,
        isBlocked: false,
        hydrated: true,
      });
    } catch {
      await get().logout();
      set({ hydrated: true });
    }
  },

  async logout() {
    setAuthToken(null);
    await secureStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(AUTH_DATA_KEY);
    set({
      token: null,
      uid: null,
      partnerId: null,
      role: null,
      capabilities: null,
      roles: [],
      primaryRole: null,
      warehouseIds: [],
      selectedWarehouseId: null,
      isBlocked: false,
      sessionExpiredMessage: get().sessionExpiredMessage,
    });
  },

  async persistAuth(data: AuthData) {
    setAuthToken(data.access_token);
    await secureStorage.setItem(TOKEN_KEY, data.access_token);
    await AsyncStorage.setItem(AUTH_DATA_KEY, JSON.stringify(data));
    const firstWarehouse = data.warehouse_ids?.[0] ?? null;
    const activeWarehouseId = get().selectedWarehouseId ?? firstWarehouse;
    const blocked = !hasWarehouseAccess(data.warehouse_ids);
    set({
      token: data.access_token,
      uid: data.uid,
      partnerId: data.partner_id,
      role: data.role,
      capabilities: data.capabilities ?? null,
      roles: data.roles ?? [],
      primaryRole: data.primary_role ?? null,
      warehouseIds: data.warehouse_ids ?? [],
      selectedWarehouseId: activeWarehouseId,
      isBlocked: blocked,
    });
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Auth] after persist', {
        tokenExists: !!data.access_token,
        role: data.role,
        capabilities: data.capabilities,
        warehouseCount: data.warehouse_ids?.length ?? 0,
        activeWarehouseId,
      });
    }
  },
}));
