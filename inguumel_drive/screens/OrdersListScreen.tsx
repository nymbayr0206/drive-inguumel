import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { fetchOrders, fetchDriveOrders, fetchDeliveryBatch } from '@/api/orders';
import { API_PATHS } from '@/api/paths';
import { normalizeError } from '@/api/client';
import { OrderCard } from '@/components/OrderCard';
import { SkeletonOrderCard } from '@/components/SkeletonOrderCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { deliveryStatusLabelMn } from '@/constants/deliveryStatusLabels';
import { useDeliveryCacheStore } from '@/store/deliveryCacheStore';
import { useOrderPatchStore } from '@/store/orderPatchStore';
import { useOrdersListRefreshStore } from '@/store/ordersListRefreshStore';
import { useAuthStore } from '@/store/authStore';
import type { Order, OrderListItem, DeliverySnapshot } from '@/types/api';

/** Prefer delivery_status_label_mn, else delivery_status_label, else label from code/state. Safe when fields missing. */
function pickStatusLabel(o: Order): string {
  const mn = (o.delivery_status_label_mn ?? '').trim();
  if (mn.length > 0) return mn;
  const label = (o.delivery_status_label ?? '').trim();
  if (label.length > 0) return label;
  const code = (o.delivery_status_code ?? o.state ?? '').trim().toLowerCase();
  return deliveryStatusLabelMn(code) || '';
}

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 30000;

const TAB_ALL = 'all';
const DELIVERY_CODES = [
  'received',
  'preparing',
  'prepared',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;

const TABS: { key: typeof TAB_ALL | (typeof DELIVERY_CODES)[number]; label: string }[] = [
  { key: 'all', label: 'Бүгд' },
  { key: 'received', label: 'Захиалга авлаа' },
  { key: 'preparing', label: 'Бэлтгэж байна' },
  { key: 'prepared', label: 'Бэлтгэж дууссан' },
  { key: 'out_for_delivery', label: 'Хүргэлтэд гарсан' },
  { key: 'delivered', label: 'Хүргэгдсэн' },
  { key: 'cancelled', label: 'Цуцлагдсан' },
];

const EMPTY_BY_TAB: Record<string, string> = {
  all: 'Одоогоор захиалга байхгүй',
  received: 'Захиалга авлаа төлөвтэй захиалга алга байна',
  preparing: 'Бэлтгэж байна төлөвтэй захиалга алга байна',
  prepared: 'Бэлтгэж дууссан төлөвтэй захиалга алга байна',
  out_for_delivery: 'Хүргэлтэд гарсан төлөвтэй захиалга алга байна',
  delivered: 'Хүргэгдсэн захиалга алга байна',
  cancelled: 'Цуцлагдсан захиалга алга байна',
};

function orderToListItem(order: Order, getDelivery: (id: string) => DeliverySnapshot | undefined): OrderListItem {
  const id = String(order.order_id ?? order.id);
  const cached = getDelivery(id);
  const code = cached?.code ?? (order.delivery_status_code ?? '').trim().toLowerCase();
  const baseLabel = cached?.label ?? pickStatusLabel(order);
  const label = (String(baseLabel ?? '').trim()) || deliveryStatusLabelMn(code) || '';
  return {
    ...order,
    delivery: code
      ? {
          code,
          label,
          last_update_at: cached?.last_update_at,
          version: cached?.version,
        }
      : undefined,
  };
}

export default function OrdersListScreen() {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const warehouseIds = useAuthStore((s) => s.warehouseIds);
  const selectedWarehouseId = useAuthStore((s) => s.selectedWarehouseId);
  const setSelectedWarehouseId = useAuthStore((s) => s.setSelectedWarehouseId);
  const setDelivery = useDeliveryCacheStore((s) => s.setDelivery);
  const setDeliverySnapshot = useDeliveryCacheStore((s) => s.setDeliverySnapshot);
  const byOrderId = useDeliveryCacheStore((s) => s.byOrderId);
  const getDelivery = useDeliveryCacheStore((s) => s.getDelivery);
  const getPatch = useOrderPatchStore((s) => s.getPatch);
  const clearPatchesForOrderIds = useOrderPatchStore((s) => s.clearPatchesForOrderIds);
  const refreshTrigger = useOrdersListRefreshStore((s) => s.refreshTrigger);

  const [orders, setOrders] = useState<Order[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [tab, setTab] = useState<typeof TAB_ALL | (typeof DELIVERY_CODES)[number]>(TAB_ALL);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadPage = useCallback(
    async (nextOffset: number, isRefresh: boolean) => {
      if (isRefresh) {
        setRefreshing(true);
        setError(null);
      } else if (nextOffset === 0) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      const whId = selectedWarehouseId ?? undefined;
      try {
        const list =
          whId
            ? await fetchDriveOrders(whId, {
                limit: PAGE_SIZE,
                offset: nextOffset,
              })
            : await fetchOrders(PAGE_SIZE, nextOffset, whId);
        if (isRefresh || nextOffset === 0) {
          setOrders(list);
          setOffset(list.length);
          setHasMore(list.length >= PAGE_SIZE);
          setLastFetchAt(Date.now());
          clearPatchesForOrderIds(list.map((o) => String(o.order_id ?? o.id)));
        } else {
          setOrders((prev) => [...prev, ...list]);
          setOffset((o) => o + list.length);
          setHasMore(list.length >= PAGE_SIZE);
        }
        const withCode = list.filter(
          (o) => (o.delivery_status_code ?? '').trim().length > 0
        );
        if (withCode.length < list.length && list.length > 0) {
          const idsToEnrich = list.map((o) => String(o.order_id ?? o.id));
          setEnriching(true);
          try {
            const batch = await fetchDeliveryBatch(idsToEnrich);
            for (const [id, d] of Object.entries(batch)) setDelivery(id, d);
          } finally {
            setEnriching(false);
          }
        } else if (list.length > 0) {
          for (const o of list) {
            const id = String(o.order_id ?? o.id);
            const code = (o.delivery_status_code ?? '').trim().toLowerCase();
            if (code) {
              const label = (pickStatusLabel(o).trim()) || deliveryStatusLabelMn(code) || '';
              const existing = getDelivery(id);
              setDeliverySnapshot(id, {
                code,
                label,
                cod_confirmed: existing?.cod_confirmed,
                cod_confirmed_at: existing?.cod_confirmed_at,
              });
            }
          }
        }
        if (__DEV__ && list.length === 0 && whId) {
          console.warn('[OrdersList] Drive orders empty. Check endpoint/domain/warehouse filter.');
        }
      } catch (err) {
        const norm = normalizeError(err);
        setError(norm.message);
        const url =
          err && typeof err === 'object' && err !== null && 'config' in err
            ? (err as { config?: { baseURL?: string; url?: string } }).config?.baseURL +
              (err as { config?: { url?: string } }).config?.url
            : whId
              ? `${API_PATHS.DRIVE_ORDERS}?warehouse_id=${whId}`
              : API_PATHS.MXM_ORDERS;
        if (__DEV__) {
          console.error('[OrdersList]', JSON.stringify({ status: norm.status, message: norm.message, code: norm.code, url }));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [selectedWarehouseId, setDelivery, setDeliverySnapshot, clearPatchesForOrderIds]
  );

  const loadInitial = useCallback(() => loadPage(0, false), [loadPage]);
  useEffect(() => {
    if (!hydrated) return;
    loadInitial();
  }, [hydrated, loadInitial]);

  useEffect(() => {
    if (refreshTrigger > 0 && hydrated) loadPage(0, true);
  }, [refreshTrigger, hydrated, loadPage]);

  useFocusEffect(
    useCallback(() => {
      if (!hydrated) return;
      loadPage(0, true);
      pollTimerRef.current = setInterval(() => {
        loadPage(0, true);
      }, POLL_INTERVAL_MS);
      return () => {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      };
    }, [hydrated, loadPage])
  );

  const onRefresh = useCallback(() => loadPage(0, true), [loadPage]);

  const onEndReached = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    loadPage(offset, false);
  }, [loadPage, loadingMore, hasMore, loading, offset]);

  const openOrder = useCallback(
    (id: string) => router.push(`/orders/${id}`),
    [router]
  );

  const baseOrders =
    selectedWarehouseId && warehouseIds.length > 1
      ? orders.filter(
          (o) =>
            (o as Order & { warehouse_id?: string }).warehouse_id === selectedWarehouseId ||
            (o as Order & { warehouseId?: string }).warehouseId === selectedWarehouseId
        )
      : orders;

  const listItems = useMemo(() => {
    return baseOrders.map((o) => {
      const id = String(o.order_id ?? o.id);
      const patch = getPatch(id);
      let merged = patch ? { ...o, ...patch } : o;
      const snap = byOrderId[id];
      if (__DEV__ && (snap?.cod_confirmed !== undefined || snap?.cod_confirmed_at != null)) {
        console.log('[CACHE GET] key=', id, 'found=', snap);
      }
      if (snap?.cod_confirmed !== undefined || snap?.cod_confirmed_at != null) {
        merged = { ...merged, cod_confirmed: snap.cod_confirmed, cod_confirmed_at: snap.cod_confirmed_at };
      }
      if (__DEV__ && snap) {
        console.log('[LIST MERGE] order', id, 'snapshot cod_confirmed=', snap.cod_confirmed);
      }
      return orderToListItem(merged, (did) => byOrderId[did]);
    });
  }, [baseOrders, byOrderId, getPatch]);

  const filteredOrders = useMemo(() => {
    if (tab === TAB_ALL) return listItems;
    return listItems.filter((item) => item.delivery?.code === tab);
  }, [listItems, tab]);

  const emptyMessage = EMPTY_BY_TAB[tab] ?? EMPTY_BY_TAB.all;

  if (!hydrated) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.muted}>Уншиж байна…</ThemedText>
      </ThemedView>
    );
  }

  if (warehouseIds.length === 0 && !loading) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Агуулах тохируулаагүй байна.</ThemedText>
      </ThemedView>
    );
  }

  if (loading && orders.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <FlatList
          data={[1, 2, 3, 4]}
          keyExtractor={(k) => String(k)}
          renderItem={() => <SkeletonOrderCard />}
          contentContainerStyle={styles.listContent}
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {warehouseIds.length > 1 ? (
        <View style={styles.warehouseRow}>
          <ThemedText type="defaultSemiBold" style={styles.label}>
            Агуулах
          </ThemedText>
          <View style={styles.chipRow}>
            {warehouseIds.map((id) => (
              <TouchableOpacity
                key={id}
                style={[styles.chip, selectedWarehouseId === id && styles.chipSelected]}
                onPress={() => setSelectedWarehouseId(id)}
                activeOpacity={0.7}
              >
                <ThemedText style={selectedWarehouseId === id ? styles.chipTextSelected : undefined}>
                  {id}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.tabs}>
        <FlatList
          horizontal
          data={TABS}
          keyExtractor={(t) => t.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
          renderItem={({ item: t }) => (
            <TouchableOpacity
              style={[styles.tab, tab === t.key && styles.tabActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.8}
            >
              <ThemedText style={[styles.tabText, tab === t.key && styles.tabTextActive]} numberOfLines={1}>
                {t.label}
              </ThemedText>
            </TouchableOpacity>
          )}
        />
      </View>

      {error ? (
        <ThemedText lightColor="#b91c1c" darkColor="#fca5a5" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}

      {__DEV__ ? (
        <View style={styles.debugBanner}>
          <ThemedText style={styles.debugBannerText}>
            DEBUG: UI PATCH ACTIVE · count={orders.length} · lastFetchAt={lastFetchAt != null ? new Date(lastFetchAt).toISOString().slice(11, 19) : '—'}
          </ThemedText>
          <TouchableOpacity style={styles.debugRefreshBtn} onPress={onRefresh}>
            <ThemedText style={styles.debugRefreshBtnText}>Refresh</ThemedText>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => String(item.order_id ?? item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText style={styles.emptyText}>{emptyMessage}</ThemedText>
          </View>
        }
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onPress={() => openOrder(String(item.order_id ?? item.id))}
          />
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  muted: { marginTop: 8, fontSize: 14, opacity: 0.8 },
  warehouseRow: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  label: { marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  chipSelected: { backgroundColor: '#0a7ea4' },
  chipTextSelected: { color: '#fff' },
  tabs: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
  },
  tabActive: { backgroundColor: '#0a7ea4' },
  tabText: { fontSize: 14 },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  error: { padding: 12, fontSize: 14 },
  debugBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fef3c7',
    borderBottomWidth: 1,
    borderBottomColor: '#f59e0b',
  },
  debugBannerText: { fontSize: 11, color: '#92400e' },
  debugRefreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#f59e0b',
    borderRadius: 6,
  },
  debugRefreshBtnText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  listContent: { paddingTop: 12, paddingBottom: 24 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 16, opacity: 0.9 },
  footer: { padding: 16, alignItems: 'center' },
});
