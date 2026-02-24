import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { getStepperIndex } from '@/lib/deliveryStatusTransitions';

interface DeliveryStepperProps {
  /** Current delivery status code (e.g. from delivery.current_status.code). */
  currentStatusCode: string | undefined;
  /** 'compact' for list card, 'default' for detail hero. */
  variant?: 'compact' | 'default';
}

const STEPS = 5;

export function DeliveryStepper({ currentStatusCode, variant = 'default' }: DeliveryStepperProps) {
  const activeIndex = getStepperIndex(currentStatusCode);
  const isCancelled = (currentStatusCode ?? '').toLowerCase() === 'cancelled';
  const dotSize = variant === 'compact' ? 6 : 8;
  const gap = variant === 'compact' ? 4 : 6;

  if (isCancelled) {
    return (
      <View style={[styles.container, styles.cancelledRow, variant === 'compact' && styles.containerCompact]}>
        {Array.from({ length: STEPS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.step,
              styles.stepCancelled,
              { width: dotSize, height: dotSize, borderRadius: dotSize / 2, marginHorizontal: gap / 2 },
            ]}
          />
        ))}
        <ThemedText style={[styles.cancelledLabel, variant === 'compact' && styles.cancelledLabelCompact]}>
          ✕ Цуцлагдсан
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.container, variant === 'compact' && styles.containerCompact]}>
      {Array.from({ length: STEPS }).map((_, i) => {
        const completed = activeIndex >= 0 && i <= activeIndex;
        const current = i === activeIndex;
        const isDelivered = activeIndex === 4;
        return (
          <View
            key={i}
            style={[
              styles.step,
              { width: dotSize, height: dotSize, borderRadius: dotSize / 2, marginHorizontal: gap / 2 },
              (completed || isDelivered) && styles.stepCompleted,
              current && styles.stepCurrent,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerCompact: {
    marginTop: 6,
  },
  step: {
    backgroundColor: '#e5e7eb',
  },
  stepCompleted: {
    backgroundColor: '#15803d',
  },
  stepCurrent: {
    backgroundColor: '#15803d',
    transform: [{ scale: 1.2 }],
  },
  stepCancelled: {
    backgroundColor: '#9ca3af',
  },
  cancelledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  cancelledLabel: {
    marginLeft: 8,
    fontSize: 12,
    color: '#6b7280',
  },
  cancelledLabelCompact: {
    marginLeft: 4,
    fontSize: 11,
  },
});
