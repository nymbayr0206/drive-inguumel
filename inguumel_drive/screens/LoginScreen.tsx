import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import {
  login as loginApi,
  isDriveStaff,
  isDeniedRole,
  hasNoWarehouseAssigned,
} from '@/api/auth';
import { normalizeError } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuthStore } from '@/store/authStore';

const ACCESS_DENIED_MESSAGE =
  'Access denied. This app is only for warehouse and delivery staff.';
const NO_WAREHOUSE_MESSAGE = 'No warehouse assigned. Contact admin.';

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinRef = useRef<TextInput>(null);

  const persistAuth = useAuthStore((s) => s.persistAuth);
  const sessionExpiredMessage = useAuthStore((s) => s.sessionExpiredMessage);
  const clearSessionExpired = useAuthStore((s) => s.setSessionExpired);

  useEffect(() => {
    if (sessionExpiredMessage) {
      setError(sessionExpiredMessage);
      clearSessionExpired(null);
    }
  }, [sessionExpiredMessage, clearSessionExpired]);

  const handleLogin = useCallback(async () => {
    Keyboard.dismiss();

    const trimmedPhone = phone.trim();
    const trimmedPin = pin.trim();

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Login] submit', { phoneLength: trimmedPhone.length, pinLength: trimmedPin.length });
    }

    if (!trimmedPhone || !trimmedPin) {
      setError('Phone and PIN are required.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[Login] request', { phone: trimmedPhone });
      }
      const data = await loginApi({
        phone: trimmedPhone,
        pin: trimmedPin,
      });
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[Login] response success', { role: data.role, warehouseCount: data.warehouse_ids?.length });
      }
      // Do NOT store token for denied roles (e.g. customer) – prevents rehydrate loops
      if (isDeniedRole(data.role)) {
        setError(ACCESS_DENIED_MESSAGE);
        setLoading(false);
        return;
      }
      if (hasNoWarehouseAssigned(data)) {
        setError(NO_WAREHOUSE_MESSAGE);
        setLoading(false);
        return;
      }
      if (!isDriveStaff(data)) {
        setError(ACCESS_DENIED_MESSAGE);
        setLoading(false);
        return;
      }
      await persistAuth({
        access_token: data.access_token,
        uid: data.uid,
        partner_id: data.partner_id,
        role: data.role,
        warehouse_ids: data.warehouse_ids,
        capabilities: data.capabilities,
        roles: data.roles,
        primary_role: data.primary_role,
      });
      // Reset-style navigation to main app (Deliveries / Status Update)
      router.replace('/orders');
    } catch (err) {
      const norm = normalizeError(err);
      setError(norm.message);
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[Login] error', { status: norm.status, message: norm.message });
      }
      if (norm.status >= 500) {
        console.error('[Login] Server error:', norm);
      }
    } finally {
      setLoading(false);
    }
  }, [phone, pin, persistAuth]);

  const handleButtonPress = useCallback(() => {
    Keyboard.dismiss();
    handleLogin();
  }, [handleLogin]);

  const isSubmitDisabled = loading;

  return (
    <ThemedView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <ThemedText type="title" style={styles.title}>
              Inguumel Drive
            </ThemedText>
            <ThemedText type="subtitle" style={styles.subtitle}>
              Warehouse & delivery
            </ThemedText>

            <TextInput
              style={styles.input}
              placeholder="Phone"
              placeholderTextColor="#687076"
              value={phone}
              onChangeText={setPhone}
              keyboardType="number-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => pinRef.current?.focus()}
              editable={!loading}
            />
            <TextInput
              ref={pinRef}
              style={styles.input}
              placeholder="PIN (6 digits)"
              placeholderTextColor="#687076"
              value={pin}
              onChangeText={setPin}
              secureTextEntry
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              maxLength={6}
              editable={!loading}
            />

            {error ? (
              <ThemedText style={styles.error} lightColor="#b91c1c" darkColor="#fca5a5">
                {error}
              </ThemedText>
            ) : null}

            <TouchableOpacity
              style={[styles.button, isSubmitDisabled && styles.buttonDisabled]}
              onPress={handleButtonPress}
              disabled={isSubmitDisabled}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.buttonText}>Log in</ThemedText>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 48,
  },
  title: {
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    minHeight: 48,
  },
  error: {
    marginBottom: 12,
    fontSize: 14,
  },
  button: {
    backgroundColor: '#0a7ea4',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
