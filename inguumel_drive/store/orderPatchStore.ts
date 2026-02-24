import { create } from 'zustand';
import type { Order } from '@/types/api';

/** Optimistic patches per order_id (e.g. after COD confirm). Merged into list order for immediate UI update. */
interface OrderPatchState {
  patches: Record<string, Partial<Order>>;
  setPatch: (orderId: string, patch: Partial<Order>) => void;
  getPatch: (orderId: string) => Partial<Order> | undefined;
  clearPatch: (orderId: string) => void;
  clearPatchesForOrderIds: (orderIds: string[]) => void;
}

export const useOrderPatchStore = create<OrderPatchState>((set, get) => ({
  patches: {},

  setPatch(orderId: string, patch: Partial<Order>) {
    set((s) => ({
      patches: { ...s.patches, [orderId]: { ...s.patches[orderId], ...patch } },
    }));
  },

  getPatch(orderId: string): Partial<Order> | undefined {
    return get().patches[orderId];
  },

  clearPatch(orderId: string) {
    set((s) => {
      const next = { ...s.patches };
      delete next[orderId];
      return { patches: next };
    });
  },

  clearPatchesForOrderIds(orderIds: string[]) {
    set((s) => {
      const next = { ...s.patches };
      for (const id of orderIds) delete next[id];
      return { patches: next };
    });
  },
}));
