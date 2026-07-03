import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AiError, testConnection } from '@/ai/client';
import { PROVIDER_PRESETS } from '@/ai/providers';
import { useLibrary } from '@/context/LibraryContext';
import { colors, font, radius, spacing } from '@/theme/theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, saveConfig } = useLibrary();

  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [model, setModel] = useState(config.model);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null);
  const [saved, setSaved] = useState(false);

  const activePreset = PROVIDER_PRESETS.find((p) => p.baseUrl === baseUrl);

  const applyPreset = (presetId: string) => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (preset.id === 'custom') {
      setBaseUrl('');
      setModel('');
    } else {
      setBaseUrl(preset.baseUrl);
      setModel(preset.defaultModel);
    }
    setTestResult(null);
  };

  const persist = () => {
    saveConfig({ baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const onTest = async () => {
    setTestResult(null);
    setTesting(true);
    // Save first so a successful test reflects what's stored.
    saveConfig({ baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey.trim() });
    try {
      await testConnection({
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim(),
      });
      setTestResult({ ok: true, message: 'Connected! Your model is ready.' });
    } catch (e: any) {
      const msg = e instanceof AiError ? e.message : 'Connection failed.';
      setTestResult({ ok: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>AI Settings</Text>
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
          Connect any OpenAI-compatible provider that hosts open-source models. Your
          key is stored only in this device&apos;s secure keychain — never in the app
          or sent anywhere except the provider you choose.
        </Text>

        <Text style={styles.label}>Provider</Text>
        <View style={styles.chipRow}>
          {PROVIDER_PRESETS.map((p) => {
            const active =
              p.id === 'custom'
                ? !PROVIDER_PRESETS.some((x) => x.id !== 'custom' && x.baseUrl === baseUrl)
                : p.baseUrl === baseUrl;
            return (
              <Pressable
                key={p.id}
                onPress={() => applyPreset(p.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && { color: colors.bg }]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activePreset && activePreset.id !== 'custom' ? (
          <View style={styles.presetNote}>
            <Text style={styles.presetNoteText}>{activePreset.notes}</Text>
            <Pressable onPress={() => Linking.openURL(activePreset.keyUrl)}>
              <Text style={styles.link}>Get a free API key →</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.label}>Base URL</Text>
        <TextInput
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder="https://api.groq.com/openai/v1"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <Text style={styles.label}>Model</Text>
        <TextInput
          value={model}
          onChangeText={setModel}
          placeholder="llama-3.3-70b-versatile"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        {activePreset && activePreset.exampleModels.length > 0 ? (
          <View style={styles.modelChips}>
            {activePreset.exampleModels.map((m) => (
              <Pressable key={m} onPress={() => setModel(m)} style={styles.modelChip}>
                <Text style={styles.modelChipText}>{m}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={styles.label}>API Key</Text>
        <View style={styles.keyRow}>
          <TextInput
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="paste your key"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showKey}
            style={[styles.input, { flex: 1 }]}
          />
          <Pressable onPress={() => setShowKey((v) => !v)} style={styles.eye} hitSlop={8}>
            <Ionicons
              name={showKey ? 'eye-off' : 'eye'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        </View>

        {testResult ? (
          <View
            style={[
              styles.testBox,
              {
                backgroundColor: testResult.ok ? colors.successDark : colors.dangerDark,
                borderColor: testResult.ok ? colors.success : colors.danger,
              },
            ]}
          >
            <Ionicons
              name={testResult.ok ? 'checkmark-circle' : 'alert-circle'}
              size={16}
              color={testResult.ok ? colors.success : colors.danger}
            />
            <Text style={styles.testText}>{testResult.message}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable onPress={onTest} disabled={testing} style={styles.testBtn}>
            {testing ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="flash" size={16} color={colors.text} />
                <Text style={styles.testBtnText}>Test</Text>
              </>
            )}
          </Pressable>
          <Pressable onPress={persist} style={styles.saveBtn}>
            <Ionicons
              name={saved ? 'checkmark' : 'save'}
              size={16}
              color={colors.bg}
            />
            <Text style={styles.saveBtnText}>{saved ? 'Saved' : 'Save'}</Text>
          </Pressable>
        </View>

        <View style={styles.privacy}>
          <Ionicons name="lock-closed" size={14} color={colors.textFaint} />
          <Text style={styles.privacyText}>
            Stored securely on-device with the iOS keychain. Remove it anytime by
            clearing the field and saving.
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
  label: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: {
    color: colors.textMuted,
    fontWeight: font.weight.semibold as '600',
    fontSize: font.size.sm,
  },
  presetNote: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  presetNoteText: { color: colors.textMuted, fontSize: font.size.xs, lineHeight: 17 },
  link: {
    color: colors.primary,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold as '700',
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
  modelChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  modelChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  modelChipText: { color: colors.textMuted, fontSize: font.size.xs },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eye: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  testBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  testText: { color: colors.text, fontSize: font.size.sm, flex: 1, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  testBtn: {
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
  testBtnText: {
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
  privacy: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  privacyText: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    flex: 1,
    lineHeight: 17,
  },
});
