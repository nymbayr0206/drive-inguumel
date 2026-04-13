import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { DeliveryStepper } from '@/components/DeliveryStepper';
import { DELIVERY_STATUS_COLOR } from '@/constants/deliveryStatusLabels';
import { getStepperIndex } from '@/lib/deliveryStatusTransitions';
import { paymentLabel } from '@/lib/paymentLabel';
import type { OrderListItem } from '@/types/api';

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function formatMoney(value: number | undefined): string {
  if (value === undefined || value === null) return '—';
  return `${Number(value).toLocaleString()} ₮`;
}

export interface OrderCardProps {
  order: OrderListItem;
  onPress: () => void;
}

function badgeColor(code: string | undefined): string {
  if (!code) return '#6b7280';
  return DELIVERY_STATUS_COLOR[code] ?? '#6b7280';
}

export function OrderCard({ order, onPress }: OrderCardProps) {
  const orderNumber = String(order.order_number ?? order.name ?? order.order_id ?? order.id ?? '—');
  const delivery = order.delivery;
  const statusLabel = delivery?.label?.trim() || '—';
  const statusCode = delivery?.code;
  const badgeColorVal = badgeColor(statusCode);
  const showStepper =
    getStepperIndex(statusCode) >= 0 || (statusCode ?? '').toLowerCase() === 'cancelled';
  const paymentLabelText = paymentLabel(order);
  const amount = order.amount_total;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.topRow}>
        <View style={styles.orderBlock}>
          <ThemedText type="defaultSemiBold" style={styles.orderNumber}>
            {orderNumber}
          </ThemedText>
          <ThemedText style={styles.orderMeta}>Updated {formatDate(order.date_order)}</ThemedText>
        </View>
        <View style={[styles.badge, { backgroundColor: badgeColorVal }]}>
          <ThemedText style={styles.badgeText}>{statusLabel}</ThemedText>
        </View>
      </View>
      <View style={styles.bottomRow}>
        <View style={styles.metricCard}>
          <ThemedText style={styles.metricLabel}>Amount</ThemedText>
          <ThemedText type="defaultSemiBold" style={styles.amount}>
            {formatMoney(amount)}
          </ThemedText>
        </View>
        <View style={styles.metricCard}>
          <ThemedText style={styles.metricLabel}>Payment</ThemedText>
          <ThemedText style={styles.paymentSub}>{paymentLabelText}</ThemedText>
        </View>
      </View>
      {showStepper ? (
        <DeliveryStepper currentStatusCode={statusCode} variant="compact" />
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 12,
  },
  orderBlock: {
    flex: 1,
  },
  orderNumber: {
    fontSize: 18,
  },
  orderMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metricLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  amount: {
    fontSize: 18,
  },
  paymentSub: {
    fontSize: 13,
    color: '#0f172a',
  },
});
