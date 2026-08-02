import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibrary } from '@/context/LibraryContext';
import { clearApiToken, hasApiToken, saveApiToken } from '@/services/apiToken';
import { isServerConfigured } from '@/services/microlearnServer';
import { colors, font, radius, spacing } from '@/theme/theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { serverConfigured } = useLibrary();

  const [serverToken, setServerToken] = useState('');
  const [tokenPresent, setTokenPresent] = useState(false);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenNotice, setTokenNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    hasApiToken().then((present) => {
      if (active) setTokenPresent(present);
    });
    return () => {
      active = false;
    };
  }, []);

  const onSaveToken = async () => {
    const value = serverToken.trim();
    if (!value) return;
    setTokenBusy(true);
    const ok = await saveApiToken(value);
    setServerToken('');
    setTokenPresent(ok);
    setTokenNotice(ok ? 'Token saved to this device.' : 'Could not save token on this device.');
    setTokenBusy(false);
  };

  const onClearToken = async () => {
    setTokenBusy(true);
    const ok = await clearApiToken();
    setServerToken('');
    if (ok) setTokenPresent(false);
    setTokenNotice(ok ? 'Token removed from this device.' : 'Could not remove token.');
    setTokenBusy(false);
  };

  const serverUrl = process.env.EXPO_PUBLIC_MICROLEARN_API_BASE_URL?.trim() || '';

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>Settings</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Lesson and roadmap generation runs on the Microlearn backend. The app stores only your
          server connection and API token — AI provider keys live on the server.
        </Text>

        <Text style={styles.sectionTitle}>Microlearn Server</Text>
        <View style={styles.statusRow}>
          <Ionicons
            name={serverConfigured ? 'cloud-done-outline' : 'cloud-offline-outline'}
            size={18}
            color={serverConfigured ? colors.success : colors.textFaint}
          />
          <Text style={styles.statusText}>
            {serverConfigured
              ? 'Server URL is configured. Generation is available when online.'
              : 'Set EXPO_PUBLIC_MICROLEARN_API_BASE_URL in your .env to connect a server.'}
          </Text>
        </View>

        {serverUrl ? (
          <View style={styles.urlBox}>
            <Text style={styles.urlLabel}>Server URL</Text>
            <Text style={styles.urlValue} selectable>
              {serverUrl}
            </Text>
          </View>
        ) : null}

        <Text style={styles.label}>API Token</Text>
        <Text style={styles.sectionHint}>
          Bearer token used when your server requires auth. Stored in the device keychain and never
          shown again after saving.
        </Text>
        <TextInput
          value={serverToken}
          onChangeText={setServerToken}
          placeholder={tokenPresent ? 'a token is saved — type to replace' : 'paste your server token'}
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          textContentType="password"
          style={styles.input}
        />

        <View style={styles.tokenStatus}>
          <Ionicons
            name={tokenPresent ? 'shield-checkmark' : 'shield-outline'}
            size={14}
            color={tokenPresent ? colors.success : colors.textFaint}
          />
          <Text style={styles.tokenStatusText}>
            {tokenNotice ?? (tokenPresent ? 'A token is saved on this device.' : 'No token saved.')}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={onClearToken}
            disabled={tokenBusy || !tokenPresent}
            style={[styles.secondaryBtn, (tokenBusy || !tokenPresent) && styles.btnDisabled]}
          >
            <Ionicons name="trash-outline" size={16} color={colors.text} />
            <Text style={styles.secondaryBtnText}>Clear</Text>
          </Pressable>
          <Pressable
            onPress={onSaveToken}
            disabled={tokenBusy || serverToken.trim().length === 0}
            style={[
              styles.saveBtn,
              (tokenBusy || serverToken.trim().length === 0) && styles.btnDisabled,
            ]}
          >
            {tokenBusy ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <>
                <Ionicons name="lock-closed" size={16} color={colors.bg} />
                <Text style={styles.saveBtnText}>Save token</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.noteBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.noteText}>
            AI generation requires server connectivity. Cached lessons and roadmaps remain readable
            offline, but new content cannot be generated without a connection.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  title: {
    color: colors.text,
    fontSize: font.size.xl,
    fontWeight: font.weight.heavy as '800',
  },
  content: { padding: spacing.lg, gap: spacing.sm },
  intro: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.heavy as '800',
    marginTop: spacing.lg,
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    flex: 1,
    lineHeight: 20,
  },
  urlBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  urlLabel: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  urlValue: {
    color: colors.text,
    fontSize: font.size.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: font.size.md,
  },
  tokenStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  tokenStatusText: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    flex: 1,
    lineHeight: 17,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: {
    color: colors.text,
    fontWeight: font.weight.bold as '700',
    fontSize: font.size.md,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  saveBtnText: {
    color: colors.bg,
    fontWeight: font.weight.heavy as '800',
    fontSize: font.size.md,
  },
  noteBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xxl,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  noteText: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    flex: 1,
    lineHeight: 17,
  },
  btnDisabled: { opacity: 0.5 },
});
