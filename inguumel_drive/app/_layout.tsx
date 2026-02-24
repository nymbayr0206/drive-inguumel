import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import 'react-native-reanimated';

import { setOnUnauthorized, setOnWarehouseNotAssigned } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { processPendingDeliveryQueue } from '@/store/pendingDeliveryStore';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const hydrate = useAuthStore((s) => s.hydrate);
  const processedOnMount = useRef(false);

  useEffect(() => {
    (async () => {
      await hydrate();
      if (!processedOnMount.current) {
        processedOnMount.current = true;
        processPendingDeliveryQueue().catch(() => {});
      }
    })();
  }, [hydrate]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        processPendingDeliveryQueue().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      useAuthStore.getState().setSessionExpired('Session expired. Please log in again.');
      useAuthStore.getState().logout();
      router.replace('/login');
    });
    setOnWarehouseNotAssigned(() => {
      useAuthStore.getState().setBlocked(true);
      router.replace('/blocked');
    });
    return () => {
      setOnUnauthorized(null);
      setOnWarehouseNotAssigned(null);
    };
  }, [router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Login' }} />
        <Stack.Screen name="blocked" options={{ title: 'Access restricted' }} />
        <Stack.Screen name="orders" options={{ title: 'Orders', headerShown: true }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
