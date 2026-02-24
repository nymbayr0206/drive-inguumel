import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { fetchOrderDetailForApp, fetchDeliveryForApp, fetchDriverOrderById, fetchDriverOrderDelivery, cashConfirmOrder, confirmDriverCod } from '@/api/orders';
import { config } from '@/config/env';
import { normalizeError } from '@/api/client';
import { DeliveryStepper } from '@/components/DeliveryStepper';
import { DeliveryTimeline } from '@/components/DeliveryTimeline';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MSG_WAITING_MN } from '@/constants/deliveryErrors';
import { getCurrentStatusCode, getDisplayLabel } from '@/lib/deliveryStatusTransitions';
import { paymentLabel } from '@/lib/paymentLabel';
import { useAuthStore, canDriverUpdateDeliveryStatus, canCashConfirm, canShowCodConfirm, canManageWarehouse } from '@/store/authStore';
import { useDeliveryCacheStore } from '@/store/deliveryCacheStore';
import { useOrderPatchStore } from '@/store/orderPatchStore';
import { useOrdersListRefreshStore } from '@/store/ordersListRefreshStore';
import type { DeliveryInfo, OrderDetail, OrderLine } from '@/types/api';

const DELIVERY_POLL_INTERVAL_MS = 10000;

function formatMoney(value: number | undefined): string {
  if (value === undefined || value === null) return '';
  return `${Number(value).toLocaleString()} ₮`;
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = id ?? '';

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [delivery, setDelivery] = useState<DeliveryInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const [deliveryBlockedNoPicking, setDeliveryBlockedNoPicking] = useState(false);
  const [cashConfirming, setCashConfirming] = useState(false);
  const [codConfirming, setCodConfirming] = useState(false);
  const lastVersionRef = useRef<number | string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollFailureCountRef = useRef(0);

  const loadDetail = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const [orderData, deliveryData] = await Promise.all([
        fetchOrderDetailForApp(orderId),
        fetchDeliveryForApp(orderId),
      ]);
      setOrder(orderData);
      setDelivery(deliveryData);
      lastVersionRef.current = deliveryData?.version ?? null;
    } catch (err) {
      const norm = normalizeError(err);
      setError(norm.message);
      console.error('[OrderDetail]', norm);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const pollDelivery = useCallback(async () => {
    if (!orderId) return;
    try {
      const deliveryData = await fetchDeliveryForApp(orderId);
      pollFailureCountRef.current = 0;
      const newVersion = deliveryData?.version ?? null;
      if (newVersion !== undefined && newVersion !== null && newVersion === lastVersionRef.current) {
        return;
      }
      lastVersionRef.current = newVersion;
      setDelivery(deliveryData);
    } catch {
      pollFailureCountRef.current = (pollFailureCountRef.current || 0) + 1;
      if (pollFailureCountRef.current >= 3) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        setPollFailed(true);
      }
    }
  }, [orderId]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    pollTimerRef.current = setInterval(pollDelivery, DELIVERY_POLL_INTERVAL_MS);
  }, [pollDelivery]);

  const handleRetryPoll = useCallback(async () => {
    setPollFailed(false);
    pollFailureCountRef.current = 0;
    await loadDetail();
    startPolling();
  }, [loadDetail, startPolling]);

  useFocusEffect(
    useCallback(() => {
      setPollFailed(false);
      pollFailureCountRef.current = 0;
      loadDetail();
      startPolling();
      return () => {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      };
    }, [loadDetail, startPolling])
  );

  const capabilities = useAuthStore((s) => s.capabilities);
  const role = useAuthStore((s) => s.role);
  const canDriverUpdate = canDriverUpdateDeliveryStatus(capabilities, role);
  const canCashConfirmPayment = canCashConfirm(capabilities, role);
  const canManageWarehousePerm = canManageWarehouse(capabilities, role);
  const setDeliveryFromCache = useDeliveryCacheStore((s) => s.setDelivery);
  const setDeliveryFromResponse = useCallback(
    (newDelivery?: DeliveryInfo | null) => {
      const next = newDelivery ?? null;
      setDelivery(next);
      if (next?.version != null) lastVersionRef.current = next.version;
      if (orderId) setDeliveryFromCache(orderId, next);
    },
    [orderId, setDeliveryFromCache]
  );

  const refetchSourceOfTruth = useCallback(async () => {
    if (!orderId) return { order: null, delivery: null };
    const { order: orderData, delivery: deliveryData } = await refetchOrderAndDelivery(orderId);
    setOrder(orderData);
    setDelivery(deliveryData);
    lastVersionRef.current = deliveryData?.version ?? null;
    setDeliveryFromCache(orderId, deliveryData);
    return { order: orderData, delivery: deliveryData };
  }, [orderId, setDeliveryFromCache]);

  const lines: OrderLine[] = order?.lines ?? order?.order_line ?? [];
  const partnerName = order?.partner?.name ?? '—';
  const phone =
    order?.shipping?.phone_primary ??
    order?.partner?.phone ??
    order?.shipping?.phone_secondary ??
    '';
  const address = order?.shipping?.address_text ?? '';
  const totalAmount = order?.amount_total ?? order?.amounts?.total;
  const hasTotal = totalAmount !== null && totalAmount !== undefined;
  const deliveryCode = getCurrentStatusCode(delivery);
  const lastUpdatedAt = delivery?.current_status?.at ?? delivery?.timeline?.[delivery?.timeline?.length - 1]?.at;

  const handleCall = useCallback(() => {
    const tel = phone.replace(/\s/g, '');
    if (tel) Linking.openURL(`tel:${tel}`);
  }, [phone]);

  const handleCopyAddress = useCallback(async () => {
    if (address) await Clipboard.setStringAsync(address);
  }, [address]);

  const paymentMethod = (order?.payment_method ?? order?.payment_method_code ?? delivery?.payment_method ?? '').toLowerCase();
  const isPaid = order?.is_paid === true || order?.payment_state_code === 'paid';
  const deliveryStatus =
    (delivery ? getCurrentStatusCode(delivery) : null) ??
    (order?.delivery_status ?? order?.delivery_status_code ?? '').toLowerCase();
  const codConfirmed = delivery?.cod_confirmed === true;
  const isCancelled = (order?.order_state_code ?? order?.state ?? '').toLowerCase() === 'cancelled';
  const showCashConfirm =
    canCashConfirmPayment &&
    paymentMethod === 'cod' &&
    !codConfirmed &&
    deliveryStatus === 'delivered';
  const showDriverCodConfirm =
    config.appContext === 'driver' &&
    canShowCodConfirm(capabilities, role) &&
    paymentMethod === 'cod' &&
    !codConfirmed &&
    !isCancelled &&
    (deliveryStatus === 'delivered' || deliveryStatus === 'out_for_delivery');
  const showCodConfirmButton = (showDriverCodConfirm || showCashConfirm) && !codConfirmed;

  const DELIVERED_PAYMENT_PENDING = 'Хүргэгдсэн – Төлбөр хүлээгдэж байна';
  const DELIVERED_PAYMENT_CONFIRMED = 'Хүргэгдсэн – Баталгаажсан';
  const deliveryDisplayLabel =
    deliveryBlockedNoPicking
      ? MSG_WAITING_MN
      : deliveryCode === 'delivered'
        ? (paymentLabel(order, delivery) === 'Төлөгдсөн' ? DELIVERED_PAYMENT_CONFIRMED : DELIVERED_PAYMENT_PENDING)
        : getDisplayLabel(delivery?.current_status?.label, deliveryCode);

  const setOrderPatch = useOrderPatchStore((s) => s.setPatch);
  const requestListRefresh = useOrdersListRefreshStore((s) => s.requestListRefresh);

  const handleCashConfirm = useCallback(async () => {
    if (!orderId || cashConfirming || !showCashConfirm) return;
    setCashConfirming(true);
    try {
      await cashConfirmOrder(orderId);
      const { order: o, delivery: d } = await refetchSourceOfTruth();
      if (o) setOrder(o);
      if (d) {
        setDelivery(d);
        lastVersionRef.current = d?.version ?? null;
        setDeliveryFromCache(orderId, d);
      }
      requestListRefresh();
      Alert.alert('', 'Төлбөр амжилттай баталгаажлаа.');
    } catch (err) {
      const norm = normalizeError(err);
      Alert.alert('Алдаа', norm.message);
      if (__DEV__) console.error('[OrderDetail] cash confirm', norm);
    } finally {
      setCashConfirming(false);
    }
  }, [orderId, cashConfirming, showCashConfirm, refetchSourceOfTruth, setDeliveryFromCache, requestListRefresh]);

  const handleCodConfirm = useCallback(async () => {
    if (config.appContext === 'driver') return handleDriverCodConfirm();
    return handleCashConfirm();
  }, [handleDriverCodConfirm, handleCashConfirm]);

  const handleDriverCodConfirm = useCallback(async () => {
    if (!orderId || codConfirming || !showDriverCodConfirm) return;
    setCodConfirming(true);
    try {
      await confirmDriverCod(orderId, {});
      setOrderPatch(orderId, {
        is_paid: true,
        payment_status_label_mn: 'Төлөгдсөн',
        cod_confirmed: true,
      });
      if (__DEV__) console.log('[COD confirm] refetch 1/3: order', orderId);
      const o = await fetchDriverOrderById(orderId);
      if (__DEV__) console.log('[COD confirm] refetch 2/3: delivery', orderId);
      const d = await fetchDriverOrderDelivery(orderId);
      setOrder(o);
      setDelivery(d);
      lastVersionRef.current = d?.version ?? null;
      setDeliveryFromCache(orderId, d);
      if (__DEV__) {
        console.log('[COD confirm] refetch 1/3 order status_history', (o as { status_history?: { code?: string }[] })?.status_history?.some((x) => x.code === 'cod_confirmed'));
        console.log('[DELIVERY PARSED]', { cod_confirmed: d?.cod_confirmed, cod_confirmed_at: d?.cod_confirmed_at });
        console.log('[COD confirm] refetch 3/3: list refresh requested');
      }
      requestListRefresh();
      Alert.alert('', 'COD баталгаажлаа');
    } catch (err) {
      const norm = normalizeError(err);
      Alert.alert('Алдаа', norm.message);
      if (__DEV__) console.error('[OrderDetail] driver COD confirm', norm);
    } finally {
      setCodConfirming(false);
    }
  }, [orderId, codConfirming, showDriverCodConfirm, setDeliveryFromCache, setOrderPatch, requestListRefresh]);

  if (!orderId) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Захиалга олдсонгүй</ThemedText>
      </ThemedView>
    );
  }

  if (loading && !order) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.skeleton}>
          <View style={[styles.skeletonBlock, styles.skeletonHero]} />
          <View style={[styles.skeletonBlock, styles.skeletonLine]} />
          <View style={[styles.skeletonBlock, styles.skeletonLine]} />
          <View style={[styles.skeletonBlock, styles.skeletonLine]} />
        </View>
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" />
        </View>
      </ThemedView>
    );
  }

  if (error && !order) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText lightColor="#b91c1c" darkColor="#fca5a5">
          {error}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* 1. DELIVERY HERO */}
        <View style={styles.heroSection}>
          <ThemedText type="title" style={styles.heroStatus}>
            {deliveryDisplayLabel || '—'}
          </ThemedText>
          <DeliveryStepper currentStatusCode={deliveryCode} variant="default" />
          {lastUpdatedAt ? (
            <ThemedText style={styles.lastUpdated}>
              Сүүлд шинэчлэгдсэн: {lastUpdatedAt}
            </ThemedText>
          ) : null}
        </View>

        {/* 2. ACTION PANEL */}
        <View style={styles.section}>
          {pollFailed ? (
            <TouchableOpacity
              style={styles.retryBanner}
              onPress={handleRetryPoll}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.retryBannerText}>
                Дахин оролдох
              </ThemedText>
            </TouchableOpacity>
          ) : null}
          <DeliveryTimeline
            orderId={orderId}
            delivery={delivery}
            onUpdated={setDeliveryFromResponse}
            refetchSourceOfTruth={refetchSourceOfTruth}
            onBlockedNoPickingChange={setDeliveryBlockedNoPicking}
            canDriverUpdateDeliveryStatus={canDriverUpdate}
            canManageWarehouse={canManageWarehousePerm}
          />
          {codConfirmed ? (
            <View style={styles.codConfirmedRow}>
              <ThemedText style={styles.codConfirmedText}>
                COD баталгаажсан: {delivery?.cod_confirmed_at ?? '—'}
                {delivery?.cod_confirmed_amount != null ? ` · ${formatMoney(delivery.cod_confirmed_amount)} ₮` : ''}
              </ThemedText>
            </View>
          ) : showCodConfirmButton ? (
            <TouchableOpacity
              style={[styles.codConfirmButton, (codConfirming || cashConfirming) && styles.buttonDisabled]}
              onPress={handleCodConfirm}
              disabled={codConfirming || cashConfirming}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.codConfirmButtonText}>
                {codConfirming || cashConfirming ? '...' : 'Төлбөр хүлээн авсан (COD)'}
              </ThemedText>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* 3. CUSTOMER INFO */}
        <View style={styles.section}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Холбоо барих
          </ThemedText>
          <ThemedText style={styles.customerName}>{partnerName}</ThemedText>
          {phone ? (
            <TouchableOpacity onPress={handleCall} activeOpacity={0.7}>
              <ThemedText style={styles.tappable}>📞 {phone}</ThemedText>
            </TouchableOpacity>
          ) : null}
          {address ? (
            <TouchableOpacity onPress={handleCopyAddress} activeOpacity={0.7}>
              <ThemedText style={styles.tappable}>📍 {address}</ThemedText>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* 4. ITEMS LIST */}
        <View style={styles.section}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Бараа
          </ThemedText>
          {lines.length === 0 ? (
            <ThemedText style={styles.muted}>Бараа байхгүй</ThemedText>
          ) : (
            lines.map((line, i) => {
              const productName = line.product_name ?? line.name ?? '—';
              const qty = line.qty ?? line.product_uom_qty ?? 0;
              const q = Number(qty);
              const priceUnit = Number(line.price_unit ?? 0);
              const discount = Number(line.discount ?? 0);
              let lineSubtotal: number | undefined =
                line.subtotal ?? line.price_subtotal;
              if (lineSubtotal === undefined || lineSubtotal === null) {
                lineSubtotal = q * priceUnit * (1 - discount / 100);
              }
              return (
                <View key={line.id ?? i} style={styles.lineRow}>
                  {line.image_url ? (
                    <Image
                      source={{ uri: String(line.image_url) }}
                      style={styles.lineImage}
                    />
                  ) : (
                    <View style={[styles.lineImage, styles.lineImagePlaceholder]} />
                  )}
                  <View style={styles.lineBody}>
                    <ThemedText type="defaultSemiBold">{productName}</ThemedText>
                    <ThemedText style={styles.muted}>
                      {q} × {formatMoney(priceUnit)}
                      {line.uom ? ` ${line.uom}` : ''}
                    </ThemedText>
                  </View>
                  <ThemedText type="defaultSemiBold" style={styles.lineTotal}>
                    {formatMoney(lineSubtotal)}
                  </ThemedText>
                </View>
              );
            })
          )}
        </View>

        {/* 5. TOTAL SUMMARY */}
        {hasTotal ? (
          <View style={styles.section}>
            <ThemedText type="defaultSemiBold" style={styles.totalLabel}>
              Нийт дүн
            </ThemedText>
            <ThemedText type="subtitle" style={styles.totalAmount}>
              {formatMoney(totalAmount)}
            </ThemedText>
            <ThemedText style={styles.paymentLabel}>
              Төлбөр: {paymentLabel(order, delivery)}
            </ThemedText>
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeleton: {
    padding: 16,
  },
  skeletonBlock: {
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
  },
  skeletonHero: {
    height: 80,
    marginBottom: 16,
  },
  skeletonLine: {
    height: 48,
    marginBottom: 12,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroSection: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  heroStatus: {
    marginBottom: 12,
    textAlign: 'center',
  },
  lastUpdated: {
    fontSize: 13,
    opacity: 0.8,
    marginTop: 8,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sectionTitle: {
    marginBottom: 10,
  },
  muted: {
    opacity: 0.8,
    fontSize: 14,
    marginTop: 2,
  },
  customerName: {
    marginBottom: 4,
  },
  tappable: {
    fontSize: 15,
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  lineImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#eee',
    marginRight: 12,
  },
  lineImagePlaceholder: {
    backgroundColor: '#e5e7eb',
  },
  lineBody: {
    flex: 1,
  },
  lineTotal: {
    marginLeft: 8,
  },
  totalLabel: {
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 22,
  },
  paymentLabel: {
    marginTop: 6,
    fontSize: 14,
    opacity: 0.9,
  },
  retryBanner: {
    padding: 12,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  retryBannerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  codConfirmButton: {
    backgroundColor: '#15803d',
    padding: 14,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  codConfirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  codConfirmedRow: {
    marginTop: 8,
  },
  codConfirmedText: {
    fontSize: 14,
    opacity: 0.9,
  },
  cashConfirmButton: {
    backgroundColor: '#15803d',
    padding: 14,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  cashConfirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
