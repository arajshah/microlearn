import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { extractContentFromUrl } from '@/ai/urlContextExtraction';
import { UrlSourceError } from '@/components/create/UrlSourceError';
import { UrlSourcePreview } from '@/components/create/UrlSourcePreview';
import {
  ExtractedUrlSource,
  RoadmapSourceContext,
  UrlExtractionError,
} from '@/types/urlSource';
import { toRoadmapSourceContext } from '@/utils/urlSourceContext';
import { isUrlInput } from '@/utils/urlValidation';
import { colors, font, radius, spacing } from '@/theme/theme';

type Phase = 'idle' | 'reading' | 'extracting' | 'preparing' | 'preview' | 'ready';

interface Props {
  apiKey: string;
  url: string;
  onUrlChange: (value: string) => void;
  disabled?: boolean;
  confirmedSource: ExtractedUrlSource | null;
  onSourceConfirmed: (source: ExtractedUrlSource, context: RoadmapSourceContext) => void;
  onSourceCleared: () => void;
}

export function UrlImportPanel({
  apiKey,
  url,
  onUrlChange,
  disabled,
  confirmedSource,
  onSourceConfirmed,
  onSourceCleared,
}: Props) {
  const [phase, setPhase] = useState<Phase>(confirmedSource ? 'ready' : 'idle');
  const [progress, setProgress] = useState('Reading source…');
  const [pendingSource, setPendingSource] = useState<ExtractedUrlSource | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<UrlExtractionError | null>(null);

  const runExtraction = useCallback(
    async (forceRefresh = false) => {
      if (!url.trim() || disabled) return;
      if (!isUrlInput(url)) {
        setError(
          new UrlExtractionError(
            'INVALID_URL',
            'Enter a complete public URL beginning with http:// or https://.',
          ),
        );
        return;
      }

      setError(null);
      setPreviewOpen(true);
      setPhase('reading');
      setProgress('Reading source…');

      try {
        await new Promise((r) => setTimeout(r, 300));
        setPhase('extracting');
        setProgress('Extracting key ideas…');

        const source = await extractContentFromUrl(url, {
          apiKey,
          forceRefresh,
        });

        setPhase('preparing');
        setProgress('Preparing learning context…');
        await new Promise((r) => setTimeout(r, 200));

        setPendingSource(source);
        setPhase('preview');
      } catch (e) {
        setPreviewOpen(false);
        setPhase('idle');
        setPendingSource(null);
        if (e instanceof UrlExtractionError) setError(e);
        else {
          setError(
            new UrlExtractionError('UNKNOWN', 'Could not read that URL. Try again or paste the text directly.'),
          );
        }
      }
    },
    [apiKey, disabled, url],
  );

  const handleContinue = () => {
    if (!pendingSource) return;
    const context = toRoadmapSourceContext(pendingSource);
    onSourceConfirmed(pendingSource, context);
    setPreviewOpen(false);
    setPhase('ready');
    setPendingSource(null);
  };

  const handleClear = () => {
    onSourceCleared();
    setPhase('idle');
    setError(null);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Import from a link</Text>
      <View style={styles.row}>
        <TextInput
          value={url}
          onChangeText={onUrlChange}
          placeholder="https://example.com/article"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, { flex: 1 }]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!disabled && phase !== 'reading' && phase !== 'extracting'}
        />
        <Pressable
          onPress={() => runExtraction(false)}
          disabled={!url.trim() || disabled || phase === 'reading' || phase === 'extracting'}
          style={[styles.fetchBtn, (!url.trim() || disabled) && { opacity: 0.5 }]}
        >
          {phase === 'reading' || phase === 'extracting' ? (
            <ActivityIndicator color={colors.bg} size="small" />
          ) : (
            <Ionicons name="globe-outline" size={18} color={colors.bg} />
          )}
        </Pressable>
      </View>

      {confirmedSource ? (
        <View style={styles.readyBox}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.readyTitle} numberOfLines={1}>
              {confirmedSource.title}
            </Text>
            <Text style={styles.readyMeta} numberOfLines={1}>
              Source linked · {confirmedSource.sections.length} sections
            </Text>
          </View>
          <Pressable onPress={handleClear} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.textFaint} />
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <UrlSourceError
          code={error.code}
          message={error.message}
          onRetry={() => runExtraction(false)}
          onCancel={() => setError(null)}
        />
      ) : null}

      <UrlSourcePreview
        visible={previewOpen}
        source={pendingSource}
        loading={phase === 'reading' || phase === 'extracting' || phase === 'preparing'}
        progressMessage={progress}
        onContinue={handleContinue}
        onRefresh={() => runExtraction(true)}
        onCancel={() => {
          setPreviewOpen(false);
          setPendingSource(null);
          setPhase('idle');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: font.size.md,
  },
  fetchBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
  },
  readyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  readyTitle: { color: colors.text, fontSize: font.size.sm, fontWeight: font.weight.bold as '700' },
  readyMeta: { color: colors.textMuted, fontSize: font.size.xs, marginTop: 2 },
});
