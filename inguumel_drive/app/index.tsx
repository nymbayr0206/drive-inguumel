import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuthStore, isAllowedRole, hasWarehouseAccess } from '@/store/authStore';

export default function IndexScreen() {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const warehouseIds = useAuthStore((s) => s.warehouseIds);
  const isBlocked = useAuthStore((s) => s.isBlocked);
  const lastDecision = useRef<string | null>(null);

  const canEnterMain =
    !!token &&
    isAllowedRole(role ?? '') &&
    hasWarehouseAccess(warehouseIds);

  useEffect(() => {
    if (!hydrated) return;

    let decision: string;
    if (isBlocked) {
      decision = 'blocked';
      if (__DEV__ && lastDecision.current !== decision) {
        lastDecision.current = decision;
        // eslint-disable-next-line no-console
        console.log('[AuthGate]', { reason: 'isBlocked', decision: '→ /blocked' });
      }
      router.replace('/blocked');
      return;
    }
    if (canEnterMain) {
      decision = 'main';
      if (__DEV__ && lastDecision.current !== decision) {
        lastDecision.current = decision;
        // eslint-disable-next-line no-console
        console.log('[AuthGate]', {
          reason: 'token + allowed role + warehouses',
          decision: '→ /orders (MainTabs)',
          role,
          warehouseCount: warehouseIds?.length ?? 0,
        });
      }
      router.replace('/orders');
      return;
    }
    decision = 'login';
    if (__DEV__ && lastDecision.current !== decision) {
      lastDecision.current = decision;
      // eslint-disable-next-line no-console
      console.log('[AuthGate]', {
        reason: !token ? 'no token' : !isAllowedRole(role ?? '') ? 'role not allowed' : 'no warehouses',
        decision: '→ /login',
      });
    }
    router.replace('/login');
  }, [hydrated, isBlocked, canEnterMain, token, role, warehouseIds, router]);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
