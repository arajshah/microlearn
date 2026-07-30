import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { UrlImportPanel } from '@/components/create/UrlImportPanel';
import { ServerSourcePreview } from '@/components/create/ServerSourcePreview';
import { ServerSourceDocument } from '@/services/microlearnServer';
import { ExtractedUrlSource, RoadmapSourceContext } from '@/types/urlSource';
import { isUrlInput } from '@/utils/urlValidation';
import { colors, font, radius, spacing } from '@/theme/theme';

export type SourceType = 'topic' | 'paste' | 'url' | 'file';

const OPTIONS: {
  id: SourceType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'topic', label: 'Topic', icon: 'bulb-outline' },
  { id: 'paste', label: 'Paste Text', icon: 'document-text-outline' },
  { id: 'url', label: 'Document Link', icon: 'link-outline' },
  { id: 'file', label: 'Upload File', icon: 'cloud-upload-outline' },
];

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export type SourceSelectorProps = {
  sourceType: SourceType;
  onSourceTypeChange: (type: SourceType) => void;
  topic: string;
  onTopicChange: (value: string) => void;
  pasteText: string;
  onPasteTextChange: (value: string) => void;
  url: string;
  onUrlChange: (value: string) => void;
  disabled?: boolean;
  apiKey?: string;
  confirmedUrlSource?: ExtractedUrlSource | null;
  onUrlSourceConfirmed?: (source: ExtractedUrlSource, context: RoadmapSourceContext) => void;
  onUrlSourceCleared?: () => void;
  topicPlaceholder?: string;
  topicOptional?: boolean;
  showTopicField?: boolean;
  accent?: string;
  useServerExtraction?: boolean;
  serverSource?: ServerSourceDocument | null;
  serverLoading?: boolean;
  serverError?: string | null;
  onExtractServer?: () => void;
  onClearServer?: () => void;
  onRetryServer?: () => void;
  fileSource?: ServerSourceDocument | null;
  fileLoading?: boolean;
  fileError?: string | null;
  onPickFile?: () => void;
  onClearFile?: () => void;
  onRetryFile?: () => void;
};

export function SourceSelector({
  sourceType,
  onSourceTypeChange,
  topic,
  onTopicChange,
  pasteText,
  onPasteTextChange,
  url,
  onUrlChange,
  disabled,
  apiKey,
  confirmedUrlSource,
  onUrlSourceConfirmed,
  onUrlSourceCleared,
  topicPlaceholder = 'What do you want to learn?',
  topicOptional = false,
  showTopicField = true,
  accent = colors.create,
  useServerExtraction = false,
  serverSource,
  serverLoading,
  serverError,
  onExtractServer,
  onClearServer,
  onRetryServer,
  fileSource,
  fileLoading,
  fileError,
  onPickFile,
  onClearFile,
  onRetryFile,
}: SourceSelectorProps) {
  const urlLooksValid = url.trim().length > 0 && isUrlInput(url);

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>Source</Text>
      <View style={styles.pillRow}>
        {OPTIONS.map((opt) => {
          const active = sourceType === opt.id;
          const isFile = opt.id === 'file';
          return (
            <Pressable
              key={opt.id}
              onPress={() => onSourceTypeChange(opt.id)}
              style={[
                styles.pill,
                active && { backgroundColor: `${accent}22`, borderColor: accent },
                isFile && !active && styles.pillMuted,
              ]}
            >
              <Ionicons
                name={opt.icon}
                size={14}
                color={active ? accent : colors.textMuted}
              />
              <Text style={[styles.pillText, active && { color: accent }]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {sourceType === 'topic' && showTopicField ? (
        <View style={styles.field}>
          <Text style={styles.label}>Topic</Text>
          <TextInput
            value={topic}
            onChangeText={onTopicChange}
            placeholder={topicPlaceholder}
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            editable={!disabled}
          />
        </View>
      ) : null}

      {sourceType === 'paste' ? (
        <View style={styles.field}>
          <Text style={styles.label}>Notes or excerpt</Text>
          <TextInput
            value={pasteText}
            onChangeText={onPasteTextChange}
            placeholder="Paste notes, excerpt, or article text"
            placeholderTextColor={colors.textFaint}
            style={[styles.input, styles.textArea]}
            editable={!disabled}
            multiline
            textAlignVertical="top"
          />
          {pasteText ? (
            <Text style={styles.hint}>{pasteText.length} characters</Text>
          ) : null}
          <Text style={[styles.label, { marginTop: spacing.md }]}>
            Focus {topicOptional ? '(optional)' : ''}
          </Text>
          <TextInput
            value={topic}
            onChangeText={onTopicChange}
            placeholder="Narrow it down, e.g. 'the causes only'"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            editable={!disabled}
          />
        </View>
      ) : null}

      {sourceType === 'url' ? (
        <View style={styles.field}>
          {useServerExtraction ? (
            <>
              <Text style={styles.label}>Document link</Text>
              <View style={styles.urlRow}>
                <TextInput
                  value={url}
                  onChangeText={onUrlChange}
                  placeholder="Paste public PDF, arXiv, article, or document link"
                  placeholderTextColor={colors.textFaint}
                  style={[styles.input, { flex: 1 }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  editable={!disabled && !serverLoading}
                />
                <Pressable
                  onPress={onExtractServer}
                  disabled={!url.trim() || disabled || serverLoading || !onExtractServer}
                  style={[styles.extractBtn, { backgroundColor: accent }, (!url.trim() || disabled) && { opacity: 0.5 }]}
                >
                  {serverLoading ? (
                    <ActivityIndicator color={colors.bg} size="small" />
                  ) : (
                    <Ionicons name="cloud-download-outline" size={18} color={colors.bg} />
                  )}
                </Pressable>
              </View>
              <ServerSourcePreview
                source={serverSource ?? null}
                loading={serverLoading}
                error={serverError}
                onClear={onClearServer}
                onRetry={onRetryServer}
                accent={accent}
              />
              <Text style={styles.hint}>
                Link import is ready for public documents. Upload is still coming soon.
              </Text>
            </>
          ) : apiKey && onUrlSourceConfirmed && onUrlSourceCleared ? (
            <UrlImportPanel
              apiKey={apiKey}
              url={url}
              onUrlChange={onUrlChange}
              disabled={disabled}
              confirmedSource={confirmedUrlSource ?? null}
              onSourceConfirmed={onUrlSourceConfirmed}
              onSourceCleared={onUrlSourceCleared}
            />
          ) : (
            <>
              <Text style={styles.label}>Document link</Text>
              <TextInput
                value={url}
                onChangeText={onUrlChange}
                placeholder="Paste public PDF, arXiv, article, or document link"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!disabled}
              />
              <Text style={styles.hint}>
                Set EXPO_PUBLIC_MICROLEARN_API_BASE_URL to enable backend extraction, or add a Gemini
                key for in-app URL import.
              </Text>
            </>
          )}
          {!useServerExtraction ? (
            <>
              {urlLooksValid && !confirmedUrlSource ? (
                <Text style={[styles.hint, { color: colors.success }]}>
                  URL looks valid — you can generate with this link as context.
                </Text>
              ) : null}
            </>
          ) : null}
          {!topicOptional ? (
            <>
              <Text style={[styles.label, { marginTop: spacing.md }]}>Focus (optional)</Text>
              <TextInput
                value={topic}
                onChangeText={onTopicChange}
                placeholder="What part of the document should the lesson cover?"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                editable={!disabled}
              />
            </>
          ) : null}
        </View>
      ) : null}

      {sourceType === 'file' ? (
        <View style={styles.fileBox}>
          <View style={styles.fileTop}>
            <View style={styles.fileIcon}>
              <Ionicons name="document-attach-outline" size={22} color={accent} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.fileTitle}>PDF, TXT, or Markdown</Text>
              <Text style={styles.hint}>Max 20 MB. Text is extracted locally by the server.</Text>
            </View>
          </View>
          <Pressable
            onPress={onPickFile}
            disabled={disabled || fileLoading || !onPickFile}
            style={[styles.uploadBtn, { backgroundColor: accent }, (disabled || fileLoading || !onPickFile) && { opacity: 0.5 }]}
          >
            {fileLoading ? (
              <ActivityIndicator color={colors.bg} size="small" />
            ) : (
              <Ionicons name="cloud-upload-outline" size={18} color={colors.bg} />
            )}
            <Text style={styles.uploadBtnText}>
              {fileSource ? 'Upload another file' : 'Upload PDF/text file'}
            </Text>
          </Pressable>
          <ServerSourcePreview
            source={fileSource ?? null}
            loading={fileLoading}
            error={fileError}
            onClear={onClearFile}
            onRetry={onRetryFile}
            accent={accent}
          />
          {fileSource?.filename || fileSource?.sizeBytes || fileSource?.mimeType ? (
            <View style={styles.fileMetaBox}>
              {fileSource.filename ? (
                <Text style={styles.fileMeta} numberOfLines={1}>File: {fileSource.filename}</Text>
              ) : null}
              {fileSource.mimeType ? (
                <Text style={styles.fileMeta} numberOfLines={1}>Type: {fileSource.mimeType}</Text>
              ) : null}
              {typeof fileSource.sizeBytes === 'number' ? (
                <Text style={styles.fileMeta} numberOfLines={1}>
                  Size: {formatFileSize(fileSource.sizeBytes)}
                </Text>
              ) : null}
            </View>
          ) : null}
          {!topicOptional ? (
            <>
              <Text style={[styles.label, { marginTop: spacing.sm }]}>Focus (optional)</Text>
              <TextInput
                value={topic}
                onChangeText={onTopicChange}
                placeholder="What part of the file should the lesson cover?"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                editable={!disabled}
              />
            </>
          ) : null}
          {!onPickFile ? (
            <View style={styles.fileWarning}>
              <Ionicons name="alert-circle" size={16} color={colors.warning} />
              <Text style={styles.fileWarningText}>Configure the local server to upload files.</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  pillMuted: { opacity: 0.85 },
  pillText: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
  },
  field: { gap: spacing.sm },
  label: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: font.size.md,
  },
  textArea: { minHeight: 140, paddingTop: spacing.md, lineHeight: 21 },
  hint: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    lineHeight: 17,
  },
  urlRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  extractBtn: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
  },
  fileBox: {
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  fileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileTitle: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold as '700',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  uploadBtnText: {
    color: colors.bg,
    fontSize: font.size.sm,
    fontWeight: font.weight.heavy as '800',
  },
  fileMetaBox: {
    gap: 2,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  fileMeta: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    lineHeight: 17,
  },
  fileWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  fileWarningText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: font.size.xs,
  },
});
