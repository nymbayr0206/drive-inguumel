import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { Text, TouchableOpacity } from 'react-native';
import { useAuthStore } from '@/store/authStore';

export default function OrdersLayout() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Захиалга',
          headerRight: () => (
            <TouchableOpacity onPress={handleLogout} style={{ marginRight: 12 }}>
              <Text style={{ color: '#0a7ea4', fontSize: 16 }}>Log out</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen name="[id]" options={{ title: 'Захиалга' }} />
    </Stack>
  );
}
