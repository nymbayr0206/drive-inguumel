import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
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
import { legal } from '@/lib/legal';
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

  const handleOpenLegal = useCallback(async (url: string) => {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      setError('Legal page could not be opened.');
      return;
    }
    await Linking.openURL(url);
  }, []);

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
            <ThemedView style={styles.heroCard}>
              <ThemedText type="title" style={styles.title}>
                Inguumel Drive
              </ThemedText>
              <ThemedText type="subtitle" style={styles.subtitle}>
                Warehouse, delivery, and COD confirmation in one workspace.
              </ThemedText>
              <ThemedText style={styles.helper}>
                Log in with the staff phone number and 6-digit PIN assigned in local Odoo.
              </ThemedText>
            </ThemedView>

            <ThemedView style={styles.formCard}>
              <ThemedText style={styles.fieldLabel}>Phone number</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="99001122"
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
              <ThemedText style={styles.fieldLabel}>PIN code</ThemedText>
              <TextInput
                ref={pinRef}
                style={styles.input}
                placeholder="123456"
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
              ) : (
                <ThemedText style={styles.inlineHint}>
                  Driver, warehouse owner, or cashier permissions with warehouses are required.
                </ThemedText>
              )}

              <TouchableOpacity
                style={[styles.button, isSubmitDisabled && styles.buttonDisabled]}
                onPress={handleButtonPress}
                disabled={isSubmitDisabled}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.buttonText}>Open workspace</ThemedText>
                )}
              </TouchableOpacity>

              <ThemedView style={styles.legalRow}>
                <TouchableOpacity
                  onPress={() => handleOpenLegal(legal.privacyPolicyUrl)}
                  disabled={loading}
                >
                  <ThemedText style={styles.legalLink}>Privacy</ThemedText>
                </TouchableOpacity>
                <ThemedText style={styles.legalDot}>•</ThemedText>
                <TouchableOpacity
                  onPress={() => handleOpenLegal(legal.termsUrl)}
                  disabled={loading}
                >
                  <ThemedText style={styles.legalLink}>Terms</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>
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
  heroCard: {
    padding: 22,
    borderRadius: 22,
    marginBottom: 18,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  title: {
    marginBottom: 10,
  },
  subtitle: {
    marginBottom: 8,
  },
  helper: {
    fontSize: 14,
    lineHeight: 20,
    color: '#334155',
  },
  formCard: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 3,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 16,
    minHeight: 52,
    backgroundColor: '#f8fafc',
  },
  error: {
    marginBottom: 14,
    fontSize: 14,
  },
  inlineHint: {
    marginBottom: 14,
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  button: {
    backgroundColor: '#0f766e',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    minHeight: 52,
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
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  legalLink: {
    fontSize: 13,
    color: '#0f766e',
    fontWeight: '600',
  },
  legalDot: {
    fontSize: 13,
    color: '#94a3b8',
  },
});
