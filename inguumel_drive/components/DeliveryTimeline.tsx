import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { updateDeliveryStatus } from '@/api/orders';
import { API_PATHS } from '@/api/paths';
import { normalizeError } from '@/api/client';
import { addPendingDelivery } from '@/store/pendingDeliveryStore';
import { MSG_WAITING_MN, NO_DELIVERY_PICKING_MESSAGE_SUBSTRING } from '@/constants/deliveryErrors';
import { API_CODES } from '@/types/api';
import { ThemedText } from '@/components/themed-text';
import {
  getCurrentStatusCode,
  getDisplayLabel,
  getAllowedNextStatusCodes,
  getStatusLabel,
  requiresConfirmation,
} from '@/lib/deliveryStatusTransitions';
import { deliveryActionButtonLabelMn } from '@/constants/deliveryStatusLabels';
import type { DeliveryInfo } from '@/types/api';
import type { NormalizedError } from '@/api/client';

const MSG_SUCCESS = 'Төлөв шинэчлэгдлээ.';
const MSG_CONFIRM_DELIVERED = 'Хүргэгдсэн болгохдоо итгэлтэй байна уу?';
const MSG_CONFIRM_CANCEL = 'Цуцлахдаа итгэлтэй байна уу?';
/** Shown after delivered: driver only finishes delivery; payment is confirmed by Cashier/POS. */
const MSG_DELIVERED_PAYMENT_PENDING = 'Хүргэгдсэн – Төлбөр хүлээгдэж байна';
/** Backend blocked_reason === "NO_DELIVERY_PICKING": show when picking not created. */
const MSG_BLOCKED_NO_PICKING =
  'Хүргэлтийн picking үүсээгүй байна. Захиалгаа confirm/stock rule үүссэн эсэхийг шалгана уу.';
const MSG_NO = 'Үгүй';
const MSG_YES = 'Тийм';
const MSG_ERROR_TITLE = 'Алдаа';
const MSG_INVALID_TRANSITION = 'Энэ төлөв рүү шилжих боломжгүй байна.';
const MSG_ERROR_MN = 'Алдаа гарлаа. Дахин оролдоно уу.';
const MSG_VERIFYING = 'Сервер баталгаажуулж дуусаагүй байна. Дахин шалгаж байна…';
const MSG_NEEDS_ATTENTION = 'Хүргэлтийн төлөв сервер дээр баталгаажаагүй байна. Захиалгыг үлдээгээрэй.';
const MSG_RETRY = 'Дахин оролдох';
/** Backend 400 when transition is no-op (e.g. delivered -> delivered); treat as success and refetch. */
const MSG_ALREADY_DELIVERED = 'Аль хэдийн хүргэгдсэн.';

/** True if backend error is "transition not allowed" (e.g. delivered -> delivered). */
function isNoOpTransitionError(norm: NormalizedError): boolean {
  const msg = (norm.message ?? '').toLowerCase();
  return (
    norm.status === 400 &&
    (msg.includes('transition from delivered to delivered') || msg.includes('not allowed'))
  );
}

/** Backend explicitly returned no-delivery-picking (e.g. 400 + message or code NO_DELIVERY_PICKING). Only then show warehouse message. */
function isNoDeliveryPickingError(norm: NormalizedError): boolean {
  if (norm.code === 'NO_DELIVERY_PICKING') return true;
  return (
    norm.status === 400 &&
    norm.code === API_CODES.VALIDATION_ERROR &&
    (norm.message ?? '').includes(NO_DELIVERY_PICKING_MESSAGE_SUBSTRING)
  );
}

interface DeliveryTimelineProps {
  orderId: string;
  delivery: DeliveryInfo | null;
  /** Called after status update with source-of-truth delivery from GET. */
  onUpdated: (newDelivery?: DeliveryInfo | null) => void;
  /** Refetch order + delivery; used for reconciliation after POST. */
  refetchSourceOfTruth: () => Promise<{ order: unknown; delivery: DeliveryInfo | null }>;
  /** When order is blocked (backend said no delivery picking), so parent can show "Хүлээгдэж байна" in hero. */
  onBlockedNoPickingChange?: (blocked: boolean) => void;
  /** Show driver status update buttons (e.g. mark delivered). Default true for backward compat. */
  canDriverUpdateDeliveryStatus?: boolean;
  /** If true: show all next_actions. If false + driver: only out_for_delivery→delivered. */
  canManageWarehouse?: boolean;
}

/** Display label: backend label first, then local Mongolian map. cod_confirmed -> "COD баталгаажсан". */
function timelineItemLabel(h: { code?: string; label?: string; status?: string }): string {
  const code = (h.code ?? h.status ?? '').toLowerCase();
  if (code === 'cod_confirmed') return 'COD баталгаажсан';
  return getDisplayLabel(h.label, code) || '—';
}

export function DeliveryTimeline({
  orderId,
  delivery,
  onUpdated,
  refetchSourceOfTruth,
  onBlockedNoPickingChange,
  canDriverUpdateDeliveryStatus = true,
  canManageWarehouse = false,
}: DeliveryTimelineProps) {
  const [updating, setUpdating] = useState(false);
  const [verificationWarning, setVerificationWarning] = useState(false);
  const [needsAttention, setNeedsAttention] = useState(false);
  const [postFailedRetry, setPostFailedRetry] = useState(false);
  const [blockedNoPicking, setBlockedNoPicking] = useState(false);
  const previousDeliveryRef = useRef<DeliveryInfo | null>(null);
  const lastAttemptedStatusCodeRef = useRef<string>('');

  /** Blocked: from API blocked_reason or POST error. */
  const apiBlocked = delivery?.blocked_reason === 'NO_DELIVERY_PICKING';
  const blocked = apiBlocked || blockedNoPicking;

  useEffect(() => {
    setBlockedNoPicking(false);
  }, [orderId]);

  useEffect(() => {
    onBlockedNoPickingChange?.(blocked);
  }, [blocked, onBlockedNoPickingChange]);

  const doUpdate = useCallback(
    async (statusCode: string) => {
      if (!orderId || updating) return;
      // Guard: no API call for no-op transitions (e.g. delivered -> delivered); prevents 400 and wrong UI rollback.
      const currentCode = getCurrentStatusCode(delivery);
      if (currentCode === statusCode) {
        if (__DEV__) console.log('[DeliveryTimeline] no-op guard: current === next, skipping API', currentCode);
        return;
      }
      setPostFailedRetry(false);
      setVerificationWarning(false);
      setNeedsAttention(false);
      lastAttemptedStatusCodeRef.current = statusCode;
      previousDeliveryRef.current = delivery;
      setUpdating(true);
      try {
        if (__DEV__) {
          console.log('[DeliveryTimeline] POST', API_PATHS.driverOrderDeliveryStatus(orderId), 'status=', statusCode);
        }
        const responseData = await updateDeliveryStatus(orderId, { status: statusCode });

        if (responseData != null) {
          onUpdated(responseData);
          Alert.alert('', MSG_SUCCESS);
          refetchSourceOfTruth().catch(() => {});
          return;
        }
      } catch (err) {
        const norm = normalizeError(err);
        if (norm.status === 200) {
          setPostFailedRetry(true);
          if (previousDeliveryRef.current) onUpdated(previousDeliveryRef.current);
          Alert.alert(MSG_ERROR_TITLE, norm.message || MSG_NEEDS_ATTENTION);
          return;
        }
        if (isNoOpTransitionError(norm)) {
          if (__DEV__) console.log('[DeliveryTimeline] no-op transition (e.g. delivered->delivered), refetching');
          refetchSourceOfTruth().then(({ delivery: d }) => d != null && onUpdated(d)).catch(() => {});
          Alert.alert('', MSG_ALREADY_DELIVERED);
          return;
        }
        if (isNoDeliveryPickingError(norm)) {
          if (__DEV__) {
            console.error('[DeliveryTimeline] no delivery picking', {
              requestId: norm.requestId,
              orderId,
              currentStatus: getCurrentStatusCode(delivery),
            });
          }
          setBlockedNoPicking(true);
          const noPickingMsg =
            MSG_BLOCKED_NO_PICKING + (norm.requestId ? `\n(Request ID: ${norm.requestId})` : '');
          Alert.alert(MSG_ERROR_TITLE, noPickingMsg);
          return;
        }
        if (previousDeliveryRef.current) {
          onUpdated(previousDeliveryRef.current);
        }
        setPostFailedRetry(true);
        if (norm.status === 0 || norm.status >= 500) {
          addPendingDelivery(orderId, statusCode).catch(() => {});
        }
        const backendMsg = norm.message || (norm.code ? `[${norm.code}]` : '') || MSG_ERROR_MN;
        const errorMessage = backendMsg + (norm.requestId ? `\n(Request ID: ${norm.requestId})` : '');
        Alert.alert(MSG_ERROR_TITLE, errorMessage);
        if (__DEV__) console.error('[DeliveryTimeline]', norm);
      } finally {
        setUpdating(false);
      }
    },
    [orderId, delivery, updating, onUpdated, refetchSourceOfTruth, onBlockedNoPickingChange]
  );

  const handleStatusPress = useCallback(
    (statusCode: string) => {
      if (requiresConfirmation(statusCode)) {
        const message = statusCode === 'cancelled' ? MSG_CONFIRM_CANCEL : MSG_CONFIRM_DELIVERED;
        Alert.alert('', message, [
          { text: MSG_NO, style: 'cancel' },
          { text: MSG_YES, onPress: () => doUpdate(statusCode) },
        ]);
        return;
      }
      doUpdate(statusCode);
    },
    [doUpdate]
  );

  const currentCode = getCurrentStatusCode(delivery);

  /** Allowed next actions: ONLY from backend next_actions when present; do not require picking_id. */
  const rawNextActions =
    Array.isArray(delivery?.next_actions) && delivery.next_actions.length > 0
      ? delivery.next_actions
      : getAllowedNextStatusCodes(currentCode);

  /** Show actions when next_actions is non-empty; no defensive no-picking gating. */
  const primaryNext = rawNextActions;

  const history = delivery?.timeline ?? delivery?.history ?? delivery?.status_history ?? [];

  return (
    <View style={styles.container}>
      {verificationWarning ? (
        <View style={styles.bannerVerifying}>
          <ThemedText style={styles.bannerText}>{MSG_VERIFYING}</ThemedText>
        </View>
      ) : null}
      {needsAttention ? (
        <View style={styles.bannerNeedsAttention}>
          <ThemedText style={styles.bannerText}>{MSG_NEEDS_ATTENTION}</ThemedText>
        </View>
      ) : null}
      {blocked ? (
        <View style={styles.bannerBlocked}>
          <ThemedText style={styles.bannerText}>{MSG_BLOCKED_NO_PICKING}</ThemedText>
          <ThemedText type="defaultSemiBold" style={styles.waitingLabel}>
            {MSG_WAITING_MN}
          </ThemedText>
        </View>
      ) : null}
      {postFailedRetry ? (
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => doUpdate(lastAttemptedStatusCodeRef.current || getCurrentStatusCode(delivery) || '')}
          disabled={updating}
        >
          <ThemedText style={styles.retryButtonText}>{MSG_RETRY}</ThemedText>
        </TouchableOpacity>
      ) : null}
      {history.length > 0 ? (
        <>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Түүх
          </ThemedText>
          {history.map((h, i) => (
            <View key={i} style={styles.timelineRow}>
              <ThemedText>{timelineItemLabel(h)}</ThemedText>
              {(h as { at?: string }).at ? (
                <ThemedText style={styles.muted}>{(h as { at: string }).at}</ThemedText>
              ) : null}
              {(h as { note?: string }).note ? (
                <ThemedText style={styles.muted}>{(h as { note: string }).note}</ThemedText>
              ) : null}
            </View>
          ))}
        </>
      ) : null}
      <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
        Дараагийн үйлдэл
      </ThemedText>
      {blocked ? (
        <ThemedText style={styles.muted}>{MSG_WAITING_MN}</ThemedText>
      ) : currentCode === 'delivered' ? (
        <ThemedText style={styles.deliveredStatus}>{MSG_DELIVERED_PAYMENT_PENDING}</ThemedText>
      ) : primaryNext.length === 0 ? (
        <ThemedText style={styles.muted}>Үйлдэл байхгүй</ThemedText>
      ) : (
        primaryNext.map((code) => (
          <TouchableOpacity
            key={code}
            style={[styles.buttonPrimary, (updating || blocked) && styles.buttonDisabled]}
            onPress={() => handleStatusPress(code)}
            disabled={updating || blocked}
          >
            <ThemedText style={styles.buttonPrimaryText}>
              {deliveryActionButtonLabelMn(code) || getStatusLabel(code) || code}
            </ThemedText>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  bannerVerifying: {
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  bannerNeedsAttention: {
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  bannerBlocked: {
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  waitingLabel: {
    marginTop: 8,
    fontSize: 15,
  },
  bannerText: {
    fontSize: 14,
    color: '#1f2937',
  },
  retryButton: {
    backgroundColor: '#0a7ea4',
    padding: 14,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    marginBottom: 8,
  },
  muted: {
    opacity: 0.8,
    fontSize: 14,
    marginTop: 2,
  },
  deliveredStatus: {
    fontSize: 15,
    color: '#15803d',
    marginTop: 2,
  },
  timelineRow: {
    marginBottom: 8,
  },
  buttonPrimary: {
    backgroundColor: '#0a7ea4',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#b91c1c',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondaryText: {
    color: '#b91c1c',
    fontSize: 16,
    fontWeight: '600',
  },
});
