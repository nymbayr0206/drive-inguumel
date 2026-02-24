import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateDeliveryStatus } from '@/api/orders';
import { normalizeError } from '@/api/client';

const PENDING_KEY = '@inguumel_drive_pending_delivery';

export interface PendingDeliveryItem {
  orderId: string;
  code: string;
  timestamp: number;
}

async function readPending(): Promise<PendingDeliveryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingDeliveryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePending(items: PendingDeliveryItem[]) {
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(items));
}

export async function addPendingDelivery(orderId: string, code: string): Promise<void> {
  const list = await readPending();
  const filtered = list.filter((i) => i.orderId !== orderId);
  filtered.push({ orderId, code, timestamp: Date.now() });
  await writePending(filtered);
}

export async function getPendingDeliveries(): Promise<PendingDeliveryItem[]> {
  return readPending();
}

export async function removePendingDelivery(orderId: string): Promise<void> {
  const list = await readPending();
  await writePending(list.filter((i) => i.orderId !== orderId));
}

/** Backend 400 "transition not allowed" (e.g. delivered->delivered): treat as no-op, remove from queue. */
function isNoOpTransitionError(status: number, message: string): boolean {
  const msg = (message ?? '').toLowerCase();
  return status === 400 && (msg.includes('transition from delivered to delivered') || msg.includes('not allowed'));
}

/**
 * Attempt to send each pending status update. Removes from queue on success.
 * On 400 "transition not allowed" (e.g. delivered->delivered), remove item and continue (no retry).
 * Call on app launch or when app becomes active (network may be restored).
 */
export async function processPendingDeliveryQueue(): Promise<void> {
  const pending = await getPendingDeliveries();
  if (pending.length === 0) return;
  for (const item of pending) {
    try {
      await updateDeliveryStatus(item.orderId, { status: item.code });
      await removePendingDelivery(item.orderId);
      if (__DEV__) console.log('[pendingDelivery] sent', item.orderId, item.code);
    } catch (e) {
      const norm = normalizeError(e);
      if (isNoOpTransitionError(norm.status, norm.message)) {
        await removePendingDelivery(item.orderId);
        if (__DEV__) console.log('[pendingDelivery] no-op transition, removed', item.orderId, item.code);
      } else if (__DEV__) {
        console.warn('[pendingDelivery] failed', item.orderId, e);
      }
    }
  }
}
