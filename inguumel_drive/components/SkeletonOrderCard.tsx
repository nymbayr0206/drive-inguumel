import { View, StyleSheet } from 'react-native';

export function SkeletonOrderCard() {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={[styles.skeleton, styles.skeletonTitle]} />
        <View style={[styles.skeleton, styles.skeletonBadge]} />
      </View>
      <View style={[styles.skeleton, styles.skeletonDate]} />
      <View style={[styles.skeleton, styles.skeletonAmount]} />
      <View style={[styles.skeleton, styles.skeletonSub]} />
      <View style={styles.stepperRow}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[styles.skeletonDot]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  skeleton: {
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
  },
  skeletonTitle: {
    width: 100,
    height: 20,
  },
  skeletonBadge: {
    width: 80,
    height: 24,
    borderRadius: 999,
  },
  skeletonDate: {
    width: 140,
    height: 14,
    marginBottom: 12,
  },
  skeletonAmount: {
    width: 90,
    height: 22,
  },
  skeletonSub: {
    width: 70,
    height: 12,
    marginTop: 6,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 4,
  },
  skeletonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e5e7eb',
  },
});
