import { create } from 'zustand';
import type { DeliveryInfo } from '@/types/api';
import { deliveryStatusLabelMn } from '@/constants/deliveryStatusLabels';
import type { DeliverySnapshot } from '@/types/api';

function deliveryToSnapshot(d: DeliveryInfo | null): DeliverySnapshot | undefined {
  if (!d) return undefined;
  const code = (d.current_status?.code ?? d.status ?? '').trim().toLowerCase();
  if (!code) return undefined;
  const label = (d.current_status?.label ?? '').trim() || deliveryStatusLabelMn(code);
  return {
    code,
    label: label || deliveryStatusLabelMn(code) || '',
    last_update_at: d.last_update_at ?? d.current_status?.at,
    version: d.version,
    cod_confirmed: d.cod_confirmed,
    cod_confirmed_at: d.cod_confirmed_at,
  };
}

interface DeliveryCacheState {
  /** order_id (string) -> snapshot */
  byOrderId: Record<string, DeliverySnapshot>;
  setDelivery: (orderId: string, data: DeliveryInfo | null) => void;
  getDelivery: (orderId: string) => DeliverySnapshot | undefined;
  setDeliverySnapshot: (orderId: string, snapshot: DeliverySnapshot | undefined) => void;
}

export const useDeliveryCacheStore = create<DeliveryCacheState>((set, get) => ({
  byOrderId: {},

  setDelivery(orderId: string, data: DeliveryInfo | null) {
    const snapshot = deliveryToSnapshot(data);
    if (__DEV__) {
      console.log('[CACHE SET] key=', orderId, 'snapshot=', snapshot);
    }
    set((s) => {
      const next = { ...s.byOrderId };
      if (snapshot) next[orderId] = snapshot;
      else delete next[orderId];
      return { byOrderId: next };
    });
  },

  getDelivery(orderId: string): DeliverySnapshot | undefined {
    return get().byOrderId[orderId];
  },

  setDeliverySnapshot(orderId: string, snapshot: DeliverySnapshot | undefined) {
    if (!snapshot) {
      set((s) => {
        const next = { ...s.byOrderId };
        delete next[orderId];
        return { byOrderId: next };
      });
      return;
    }
    set((s) => ({
      byOrderId: { ...s.byOrderId, [orderId]: snapshot },
    }));
  },
}));
