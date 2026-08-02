import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SourceSelector, SourceType } from '@/components/create/SourceSelector';
import { RoadmapGenerationForm } from '@/components/roadmap/RoadmapGenerationForm';
import {
  AppScreen,
  EmptyState,
  GlassCard,
  SectionHeader,
} from '@/components/ui';
import { useLibrary } from '@/context/LibraryContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useProgress } from '@/context/ProgressContext';
import { useRoadmaps } from '@/context/RoadmapContext';
import { getSubject, subjects } from '@/data/courses';
import { MASTERY_TIERS, MasteryLevel } from '@/data/mastery';
import { SubjectId } from '@/types/content';
import { RoadmapDepth, LESSON_SLIDE_PRESETS, ROADMAP_LESSON_PRESETS, ROADMAP_SLIDES_PRESETS } from '@/types/roadmap';
import { ExtractedUrlSource, RoadmapSourceContext } from '@/types/urlSource';
import { suggestedMasteryLevel } from '@/utils/adaptive';
import { formatSourceAsText } from '@/utils/urlSourceContext';
import { isUrlInput, normalizeUrl } from '@/utils/urlValidation';
import { roadmapStats } from '@/utils/roadmapProgress';
import {
  extractServerDocumentSource,
  fetchServerDocumentSource,
  formatServerSourceAsText,
  isServerConfigured,
  ServerSourceDocument,
  uploadDocumentSource,
} from '@/services/microlearnServer';
import { colors, font, gradients, radius, shadow, spacing } from '@/theme/theme';
import { useScreenRefresh } from '@/hooks/useScreenRefresh';

type CreateTab = 'lesson' | 'roadmap';

const DEPTHS: RoadmapDepth[] = ['quick', 'standard', 'deep'];
const LESSON_SIZE_LABELS: Record<RoadmapDepth, string> = {
  quick: 'Focused',
  standard: 'Standard',
  deep: 'Deep dive',
};
const LESSON_SIZE_HINTS: Record<RoadmapDepth, string> = {
  quick: '5 slides',
  standard: '8 slides',
  deep: '12 slides',
};
const SUPPORTED_UPLOAD_MIMES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
];

function serverSourceToContext(source: ServerSourceDocument, text: string): RoadmapSourceContext {
  return {
    sourceUrl: source.normalizedUrl || source.url,
    sourceTitle: source.title ?? 'Document',
    sourceSummary: source.summary?.preview ?? text.slice(0, 500),
    sourceSections: (source.summary?.detectedSections ?? []).map((heading) => ({
      heading,
      summary: '',
      keyPoints: [],
    })),
    keyConcepts: [],
    importantTerms: [],
    sourceWarnings: [],
  };
}

function topicHint(id: SubjectId): string {
  switch (id) {
    case 'economics':
      return 'game theory';
    case 'philosophy':
      return 'stoicism';
    case 'literature':
      return 'magical realism';
    case 'computer-science':
      return 'recursion';
    case 'history':
      return 'the Cold War';
    case 'psychology':
      return 'cognitive biases';
    case 'mathematics':
      return 'probability';
    default:
      return 'anything';
  }
}

function TabSegment({
  tab,
  onChange,
}: {
  tab: CreateTab;
  onChange: (t: CreateTab) => void;
}) {
  return (
    <View style={styles.segmentRow}>
      {(
        [
          { id: 'lesson' as const, label: 'Single Lesson' },
          { id: 'roadmap' as const, label: 'Roadmap' },
        ] as const
      ).map((item) => {
        const active = tab === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => onChange(item.id)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SlideCountStepper({
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.slideStepperBlock}>
      <Text style={styles.fieldLabel}>Slides in this lesson</Text>
      <View style={styles.slideStepperRow}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - 1))}
          disabled={disabled || value <= min}
          style={[styles.slideStepBtn, (disabled || value <= min) && styles.slideStepBtnDisabled]}
        >
          <Ionicons name="remove" size={16} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.slideStepValue}>{value}</Text>
        <Pressable
          onPress={() => onChange(Math.min(max, value + 1))}
          disabled={disabled || value >= max}
          style={[styles.slideStepBtn, (disabled || value >= max) && styles.slideStepBtnDisabled]}
        >
          <Ionicons name="add" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

function DepthSelector({
  value,
  onChange,
  disabled,
  variant = 'roadmap',
}: {
  value: RoadmapDepth;
  onChange: (d: RoadmapDepth) => void;
  disabled?: boolean;
  variant?: 'lesson' | 'roadmap';
}) {
  const isLesson = variant === 'lesson';
  return (
    <View style={styles.depthBlock}>
      <Text style={styles.fieldLabel}>{isLesson ? 'Lesson size' : 'Roadmap size'}</Text>
      <View style={styles.depthRow}>
        {DEPTHS.map((d) => {
          const active = value === d;
          const title = isLesson
            ? LESSON_SIZE_LABELS[d]
            : ({ quick: 'Short path', standard: 'Standard path', deep: 'Deep path' } as const)[d];
          const hint = isLesson
            ? LESSON_SIZE_HINTS[d]
            : ({
                quick: 'A shorter sequence to reach the goal quickly.',
                standard: 'A balanced lesson sequence with steady progression.',
                deep: 'A thorough path with more depth and practice.',
              } as const)[d];
          return (
            <Pressable
              key={d}
              onPress={() => onChange(d)}
              disabled={disabled}
              style={[styles.depthChip, active && styles.depthChipActive]}
            >
              <Text style={[styles.depthTitle, active && { color: colors.text }]}>{title}</Text>
              <Text style={styles.depthHint}>{hint}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MasterySelector({
  value,
  onChange,
  recommended,
  disabled,
}: {
  value: MasteryLevel;
  onChange: (l: MasteryLevel) => void;
  recommended: MasteryLevel;
  disabled?: boolean;
}) {
  return (
    <View style={styles.masteryBlock}>
      <Text style={styles.fieldLabel}>Mastery level</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.masteryRow}
      >
        {MASTERY_TIERS.map((tier) => {
          const active = tier.level === value;
          const isRec = tier.level === recommended;
          return (
            <Pressable
              key={tier.level}
              onPress={() => onChange(tier.level)}
              disabled={disabled}
              style={[styles.masteryChip, active && styles.masteryChipActive]}
            >
              <Text style={[styles.masteryLevel, active && { color: colors.create }]}>
                L{tier.level}
              </Text>
              <Text style={[styles.masteryName, active && { color: colors.text }]}>
                {tier.name}
              </Text>
              {isRec ? (
                <View style={styles.recDot}>
                  <Ionicons name="star" size={9} color={colors.bg} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.hint}>
        Recommended: Level {recommended} ({MASTERY_TIERS.find((t) => t.level === recommended)?.name})
      </Text>
    </View>
  );
}

export default function CreateScreen() {
  const router = useRouter();
  const {
    serverConfigured,
    hydrated,
    generate,
    generatedLessons,
    deleteLesson,
    refreshFromBackend,
  } = useLibrary();
  const { level } = usePreferences();
  const { subjectProgress } = useProgress();
  const {
    roadmaps,
    generatingRoadmap,
    generateRoadmapFlow,
    deleteRoadmap,
    hydrated: roadmapsHydrated,
    refreshRoadmaps,
  } = useRoadmaps();

  const refreshCreateData = useCallback(async () => {
    await Promise.all([refreshFromBackend(), refreshRoadmaps()]);
  }, [refreshFromBackend, refreshRoadmaps]);
  const { refreshing, refresh } = useScreenRefresh(refreshCreateData);

  const [tab, setTab] = useState<CreateTab>('lesson');

  const [lessonSourceType, setLessonSourceType] = useState<SourceType>('topic');
  const [lessonTopic, setLessonTopic] = useState('');
  const [lessonPaste, setLessonPaste] = useState('');
  const [lessonUrl, setLessonUrl] = useState('');
  const [lessonUrlSource, setLessonUrlSource] = useState<ExtractedUrlSource | null>(null);
  const [lessonSourceContext, setLessonSourceContext] = useState<RoadmapSourceContext | null>(null);
  const [subjectId, setSubjectId] = useState<SubjectId>(subjects[0].id);
  const [lessonDepth, setLessonDepth] = useState<RoadmapDepth>('standard');
  const [lessonSlideCount, setLessonSlideCount] = useState(LESSON_SLIDE_PRESETS.standard);
  const [masteryLevel, setMasteryLevel] = useState<MasteryLevel>(3);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [lessonServerSource, setLessonServerSource] = useState<ServerSourceDocument | null>(null);
  const [lessonServerLoading, setLessonServerLoading] = useState(false);
  const [lessonServerError, setLessonServerError] = useState<string | null>(null);
  const [lessonFileSource, setLessonFileSource] = useState<ServerSourceDocument | null>(null);
  const [lessonFileLoading, setLessonFileLoading] = useState(false);
  const [lessonFileError, setLessonFileError] = useState<string | null>(null);

  const [rmSourceType, setRmSourceType] = useState<SourceType>('topic');
  const [rmTopic, setRmTopic] = useState('');
  const [rmGoal, setRmGoal] = useState('');
  const [rmPaste, setRmPaste] = useState('');
  const [rmUrl, setRmUrl] = useState('');
  const [rmUrlSource, setRmUrlSource] = useState<ExtractedUrlSource | null>(null);
  const [rmSourceContext, setRmSourceContext] = useState<RoadmapSourceContext | null>(null);
  const [rmMastery, setRmMastery] = useState<MasteryLevel>(level);
  const [rmDepth, setRmDepth] = useState<RoadmapDepth>('standard');
  const [rmLessonCount, setRmLessonCount] = useState(ROADMAP_LESSON_PRESETS.standard);
  const [rmSlidesPerLesson, setRmSlidesPerLesson] = useState(ROADMAP_SLIDES_PRESETS.standard);
  const [rmPrefs, setRmPrefs] = useState('');
  const [rmError, setRmError] = useState<string | null>(null);
  const [rmLoadingMsg, setRmLoadingMsg] = useState('Designing your learning path…');
  const [rmServerSource, setRmServerSource] = useState<ServerSourceDocument | null>(null);
  const [rmServerLoading, setRmServerLoading] = useState(false);
  const [rmServerError, setRmServerError] = useState<string | null>(null);
  const [rmFileSource, setRmFileSource] = useState<ServerSourceDocument | null>(null);
  const [rmFileLoading, setRmFileLoading] = useState(false);
  const [rmFileError, setRmFileError] = useState<string | null>(null);

  const serverExtractionEnabled = isServerConfigured();

  const effectiveLessonMastery = useMemo((): MasteryLevel => {
    if (lessonDepth === 'quick') return Math.max(1, masteryLevel - 1) as MasteryLevel;
    if (lessonDepth === 'deep') return Math.min(5, masteryLevel + 1) as MasteryLevel;
    return masteryLevel;
  }, [lessonDepth, masteryLevel]);

  const subject = subjects.find((s) => s.id === subjectId)!;

  const recommended = useMemo(
    () => suggestedMasteryLevel(level, subjectProgress(subjectId).pct),
    [level, subjectProgress, subjectId],
  );

  useEffect(() => {
    setMasteryLevel(recommended);
  }, [recommended]);

  useEffect(() => {
    setRmMastery(level);
  }, [level]);

  const resolveLessonUrl = (): string | undefined => {
    if (lessonSourceType === 'file' && lessonFileSource) return lessonFileSource.url;
    if (lessonServerSource?.normalizedUrl) return lessonServerSource.normalizedUrl;
    if (lessonServerSource?.url) return lessonServerSource.url;
    if (lessonUrlSource?.originalUrl) return lessonUrlSource.originalUrl;
    if (lessonSourceContext?.sourceUrl) return lessonSourceContext.sourceUrl;
    if (lessonSourceType === 'url' && lessonUrl.trim() && isUrlInput(lessonUrl)) {
      try {
        return normalizeUrl(lessonUrl);
      } catch {
        return undefined;
      }
    }
    return undefined;
  };

  const resolveRoadmapUrl = (): string | undefined => {
    if (rmSourceType === 'file' && rmFileSource) return rmFileSource.url;
    if (rmServerSource?.normalizedUrl) return rmServerSource.normalizedUrl;
    if (rmServerSource?.url) return rmServerSource.url;
    if (rmUrlSource?.originalUrl) return rmUrlSource.originalUrl;
    if (rmSourceContext?.sourceUrl) return rmSourceContext.sourceUrl;
    if (rmSourceType === 'url' && rmUrl.trim() && isUrlInput(rmUrl)) {
      try {
        return normalizeUrl(rmUrl);
      } catch {
        return undefined;
      }
    }
    return undefined;
  };

  const buildRoadmapPreferences = (): string | undefined => {
    const parts: string[] = [];
    if (rmPrefs.trim()) parts.push(rmPrefs.trim());
    if (rmSourceType === 'paste' && rmPaste.trim()) {
      parts.push(`Source material:\n${rmPaste.trim()}`);
    }
    return parts.length ? parts.join('\n\n') : undefined;
  };

  const extractLessonServerSource = async (force = false) => {
    if (!lessonUrl.trim()) return;
    setLessonServerLoading(true);
    setLessonServerError(null);
    const result = await extractServerDocumentSource(lessonUrl, force);
    setLessonServerLoading(false);
    if (result.source) {
      setLessonServerSource(result.source);
      if (!lessonTopic.trim() && result.source.title) setLessonTopic(result.source.title);
    }
    if (!result.ok) {
      setLessonServerError(result.errorMessage ?? 'Extraction failed.');
    }
  };

  const extractRoadmapServerSource = async (force = false) => {
    if (!rmUrl.trim()) return;
    setRmServerLoading(true);
    setRmServerError(null);
    const result = await extractServerDocumentSource(rmUrl, force);
    setRmServerLoading(false);
    if (result.source) {
      setRmServerSource(result.source);
      if (!rmTopic.trim() && result.source.title) setRmTopic(result.source.title);
    }
    if (!result.ok) {
      setRmServerError(result.errorMessage ?? 'Extraction failed.');
    }
  };

  const pickUploadFile = async (
    setSource: (source: ServerSourceDocument | null) => void,
    setLoading: (loading: boolean) => void,
    setError: (error: string | null) => void,
    applyTitle: (source: ServerSourceDocument) => void,
  ) => {
    if (!serverExtractionEnabled) {
      setError('Configure the local server before uploading files.');
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: SUPPORTED_UPLOAD_MIMES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset?.uri || !asset.name) {
      setError('Could not read the selected file.');
      return;
    }

    setLoading(true);
    setError(null);
    const upload = await uploadDocumentSource({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
    });
    setLoading(false);
    if (upload.source) {
      setSource(upload.source);
      applyTitle(upload.source);
    }
    if (!upload.ok) {
      setError(upload.errorMessage ?? 'Could not extract text from this file.');
    }
  };

  const uploadLessonFile = () =>
    pickUploadFile(
      setLessonFileSource,
      setLessonFileLoading,
      setLessonFileError,
      (source) => {
        if (!lessonTopic.trim() && source.title) setLessonTopic(source.title);
      },
    );

  const uploadRoadmapFile = () =>
    pickUploadFile(
      setRmFileSource,
      setRmFileLoading,
      setRmFileError,
      (source) => {
        if (!rmTopic.trim() && source.title) setRmTopic(source.title);
      },
    );

  const onGenerateLesson = async () => {
    const hasPastedText = lessonPaste.trim().length >= 80;
    const hasServerSource = lessonServerSource?.status === 'ready';
    const hasFileSource = lessonFileSource?.status === 'ready';
    const hasUrlSource = Boolean(lessonSourceContext || lessonUrlSource || hasServerSource);
    const hasValidUrl = Boolean(resolveLessonUrl());

    if (lessonSourceType === 'paste' && !hasPastedText) {
      setLessonError('Paste at least 80 characters of source text.');
      return;
    }
    if (lessonSourceType === 'url' && !hasUrlSource && !hasValidUrl) {
      setLessonError('Enter a valid document link and extract content from the URL.');
      return;
    }
    if (lessonSourceType === 'url' && serverExtractionEnabled && !hasServerSource && !lessonSourceContext && !lessonUrlSource) {
      setLessonError('Extract the document before generating.');
      return;
    }
    if (lessonSourceType === 'file' && !hasFileSource) {
      setLessonError('Upload a ready PDF, TXT, or Markdown file first.');
      return;
    }

    setLessonError(null);
    setLessonLoading(true);
    try {
      let sourceText: string | undefined;
      if (lessonSourceType === 'paste') {
        sourceText = lessonPaste;
      } else if (lessonSourceType === 'url') {
        if (hasServerSource && lessonServerSource) {
          const full = await fetchServerDocumentSource(lessonServerSource.id, true);
          const text = full?.extractedText ?? lessonServerSource.summary?.preview ?? '';
          sourceText = text ? formatServerSourceAsText(lessonServerSource, text, lessonTopic) : undefined;
        } else if (lessonSourceContext) {
          sourceText = formatSourceAsText(lessonSourceContext, lessonTopic);
        }
      } else if (lessonSourceType === 'file' && lessonFileSource?.status === 'ready') {
        const full = await fetchServerDocumentSource(lessonFileSource.id, true);
        const text = full?.extractedText ?? lessonFileSource.summary?.preview ?? '';
        sourceText = text ? formatServerSourceAsText(lessonFileSource, text, lessonTopic) : undefined;
      }

      const lesson = await generate({
        subjectId,
        topic: lessonTopic,
        masteryLevel: effectiveLessonMastery,
        slideCount: lessonSlideCount,
        sourceText,
        sourceUrl: resolveLessonUrl(),
        sourceTitle: lessonFileSource?.title ?? lessonServerSource?.title ?? lessonUrlSource?.title ?? lessonSourceContext?.sourceTitle,
      });
      setLessonTopic('');
      setLessonPaste('');
      setLessonUrl('');
      setLessonUrlSource(null);
      setLessonSourceContext(null);
      setLessonServerSource(null);
      setLessonServerError(null);
      setLessonFileSource(null);
      setLessonFileError(null);
      router.push(`/lesson/${lesson.id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Try again.';
      setLessonError(msg);
    } finally {
      setLessonLoading(false);
    }
  };

  const onGenerateRoadmap = async () => {
    if (generatingRoadmap) return;
    if (!rmTopic.trim() || !rmGoal.trim()) {
      setRmError('Topic and learning goal are required.');
      return;
    }
    if (rmSourceType === 'paste' && rmPaste.trim().length < 80) {
      setRmError('Paste at least 80 characters of source text.');
      return;
    }
    if (rmSourceType === 'url') {
      const hasServer = rmServerSource?.status === 'ready';
      const hasLegacy = Boolean(rmSourceContext || rmUrlSource || resolveRoadmapUrl());
      if (serverExtractionEnabled && !hasServer) {
        setRmError('Extract the document before generating.');
        return;
      }
      if (!serverExtractionEnabled && !hasLegacy) {
        setRmError('Enter a valid document link or extract content from the URL.');
        return;
      }
    }
    if (rmSourceType === 'file' && rmFileSource?.status !== 'ready') {
      setRmError('Upload a ready PDF, TXT, or Markdown file first.');
      return;
    }

    setRmError(null);
    setRmLoadingMsg(
      rmFileSource || rmServerSource || rmSourceContext ? 'Building your roadmap from source…' : 'Mapping units and lesson sequence…',
    );
    try {
      let sourceContext = rmSourceContext ?? undefined;
      if (rmSourceType === 'url' && rmServerSource?.status === 'ready') {
        const full = await fetchServerDocumentSource(rmServerSource.id, true);
        const text = full?.extractedText ?? rmServerSource.summary?.preview ?? '';
        if (text) sourceContext = serverSourceToContext(rmServerSource, text);
      } else if (rmSourceType === 'file' && rmFileSource?.status === 'ready') {
        const full = await fetchServerDocumentSource(rmFileSource.id, true);
        const text = full?.extractedText ?? rmFileSource.summary?.preview ?? '';
        if (text) sourceContext = serverSourceToContext(rmFileSource, text);
      }

      const roadmap = await generateRoadmapFlow({
        topic: rmTopic.trim(),
        goal: rmGoal.trim(),
        masteryLevel: rmMastery,
        depth: rmDepth,
        lessonCount: rmLessonCount,
        slidesPerLesson: rmSlidesPerLesson,
        preferences: buildRoadmapPreferences(),
        sourceUrl: resolveRoadmapUrl(),
        sourceExtractionId: rmFileSource?.id ?? rmUrlSource?.id ?? rmServerSource?.id,
        sourceContext,
      });
      router.push(`/roadmap/${roadmap.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not generate roadmap.';
      setRmError(msg);
    }
  };

  const handleLessonUrlConfirmed = (
    source: ExtractedUrlSource,
    context: RoadmapSourceContext,
  ) => {
    setLessonUrlSource(source);
    setLessonSourceContext(context);
    if (!lessonTopic.trim()) setLessonTopic(source.suggestedTopic);
  };

  const handleRoadmapUrlConfirmed = (
    source: ExtractedUrlSource,
    context: RoadmapSourceContext,
  ) => {
    setRmUrlSource(source);
    setRmSourceContext(context);
    if (!rmTopic.trim()) setRmTopic(source.suggestedTopic);
    if (!rmGoal.trim()) setRmGoal(source.suggestedLearningGoal);
  };

  const confirmDeleteRoadmap = (id: string, title: string) => {
    Alert.alert('Delete roadmap?', `Remove "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRoadmap(id) },
    ]);
  };

  const confirmDeleteLesson = (id: string, title: string) => {
    Alert.alert('Delete lesson?', `Remove "${title}" from your library?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteLesson(id) },
    ]);
  };

  const lessonGenerateDisabled =
    !serverConfigured ||
    lessonLoading ||
    lessonFileLoading ||
    (lessonSourceType === 'paste' && lessonPaste.trim().length < 80) ||
    (lessonSourceType === 'file' && lessonFileSource?.status !== 'ready') ||
    (lessonSourceType === 'url' &&
      serverExtractionEnabled &&
      lessonServerSource?.status !== 'ready' &&
      !lessonSourceContext &&
      !lessonUrlSource) ||
    (lessonSourceType === 'url' &&
      !serverExtractionEnabled &&
      !lessonSourceContext &&
      !lessonUrlSource &&
      !resolveLessonUrl());

  const roadmapGenerateDisabled =
    !serverConfigured ||
    !rmTopic.trim() ||
    !rmGoal.trim() ||
    rmFileLoading ||
    (rmSourceType === 'paste' && rmPaste.trim().length < 80) ||
    (rmSourceType === 'file' && rmFileSource?.status !== 'ready') ||
    (rmSourceType === 'url' &&
      serverExtractionEnabled &&
      rmServerSource?.status !== 'ready' &&
      !rmSourceContext &&
      !rmUrlSource) ||
    (rmSourceType === 'url' &&
      !serverExtractionEnabled &&
      !rmSourceContext &&
      !rmUrlSource &&
      !resolveRoadmapUrl());

  const serverBanner =
    hydrated && !serverConfigured ? (
      <Pressable onPress={() => router.push('/settings')}>
        <LinearGradient
          colors={gradients.create}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.setupCard}
        >
          <Ionicons name="cloud-outline" size={26} color={colors.white} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.setupTitle}>Connect to Microlearn server</Text>
            <Text style={styles.setupText} numberOfLines={2}>
              Set your server URL and API token in Settings to generate lessons and roadmaps.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.white} />
        </LinearGradient>
      </Pressable>
    ) : null;

  const recentRoadmaps = roadmaps.slice(0, 3);
  const recentLessons = generatedLessons.slice(0, 3);

  return (
    <AppScreen
      scroll
      contentStyle={styles.content}
      scrollProps={{ keyboardShouldPersistTaps: 'handled' }}
      refresh={{ refreshing, onRefresh: refresh, accent: colors.create }}
    >
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.pageTitle}>Create</Text>
          <Text style={styles.pageSubtitle}>
            Turn a topic, notes, or a document into learning material.
          </Text>
        </View>
        <Pressable onPress={() => router.push('/settings')} style={styles.gear} hitSlop={10}>
          <Ionicons name="settings-outline" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {serverBanner}

      <TabSegment tab={tab} onChange={setTab} />

      {tab === 'lesson' ? (
        <>
          <View style={styles.tabIntro}>
            <Text style={styles.tabTitle}>Create a single lesson</Text>
            <Text style={styles.tabSubtitle}>
              One focused lesson with slides, examples, and checks.
            </Text>
          </View>

          <GlassCard accent={colors.create}>
            <SourceSelector
              sourceType={lessonSourceType}
              onSourceTypeChange={setLessonSourceType}
              topic={lessonTopic}
              onTopicChange={setLessonTopic}
              pasteText={lessonPaste}
              onPasteTextChange={setLessonPaste}
              url={lessonUrl}
              onUrlChange={setLessonUrl}
              disabled={lessonLoading || !serverConfigured}
              confirmedUrlSource={lessonUrlSource}
              onUrlSourceConfirmed={handleLessonUrlConfirmed}
              onUrlSourceCleared={() => {
                setLessonUrlSource(null);
                setLessonSourceContext(null);
              }}
              useServerExtraction={serverExtractionEnabled}
              serverSource={lessonServerSource}
              serverLoading={lessonServerLoading}
              serverError={lessonServerError}
              onExtractServer={() => extractLessonServerSource(false)}
              onClearServer={() => {
                setLessonServerSource(null);
                setLessonServerError(null);
              }}
              onRetryServer={() => extractLessonServerSource(true)}
              fileSource={lessonFileSource}
              fileLoading={lessonFileLoading}
              fileError={lessonFileError}
              onPickFile={serverExtractionEnabled ? uploadLessonFile : undefined}
              onClearFile={() => {
                setLessonFileSource(null);
                setLessonFileError(null);
              }}
              onRetryFile={uploadLessonFile}
              topicPlaceholder={`What do you want to learn? e.g. "${topicHint(subjectId)}"`}
              accent={colors.create}
            />

            <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Subject</Text>
            <View style={styles.subjectRow}>
              {subjects.map((s) => {
                const active = s.id === subjectId;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setSubjectId(s.id)}
                    style={[
                      styles.subjectChip,
                      active && { backgroundColor: s.accent, borderColor: s.accent },
                    ]}
                  >
                    <Ionicons
                      name={s.icon as keyof typeof Ionicons.glyphMap}
                      size={14}
                      color={active ? colors.bg : colors.textMuted}
                    />
                    <Text style={[styles.subjectChipText, active && { color: colors.bg }]}>
                      {s.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {lessonSourceType === 'topic' ? (
              <Text style={styles.hint}>
                Leave topic blank for a general {subject.title} lesson.
              </Text>
            ) : null}

            <DepthSelector
              value={lessonDepth}
              onChange={(d) => {
                setLessonDepth(d);
                setLessonSlideCount(LESSON_SLIDE_PRESETS[d]);
              }}
              disabled={lessonLoading}
              variant="lesson"
            />
            <SlideCountStepper
              value={lessonSlideCount}
              min={3}
              max={20}
              disabled={lessonLoading}
              onChange={setLessonSlideCount}
            />
            <MasterySelector
              value={masteryLevel}
              onChange={setMasteryLevel}
              recommended={recommended}
              disabled={lessonLoading}
            />

            {lessonError ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{lessonError}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={onGenerateLesson}
              disabled={lessonGenerateDisabled}
              style={[styles.generateBtn, lessonGenerateDisabled && styles.generateDisabled]}
            >
              {lessonLoading ? (
                <>
                  <ActivityIndicator color={colors.bg} />
                  <Text style={styles.generateText}>Generating…</Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name="sparkles"
                    size={18}
                    color={lessonGenerateDisabled ? colors.textFaint : colors.bg}
                  />
                  <Text
                    style={[
                      styles.generateText,
                      lessonGenerateDisabled && { color: colors.textFaint },
                    ]}
                  >
                    {!serverConfigured ? 'Connect server in Settings' : 'Generate lesson'}
                  </Text>
                </>
              )}
            </Pressable>
          </GlassCard>
        </>
      ) : (
        <>
          <View style={styles.tabIntro}>
            <Text style={styles.tabTitle}>Create a roadmap</Text>
            <Text style={styles.tabSubtitle}>
              A sequence of lessons organized toward a goal.
            </Text>
          </View>

          <GlassCard accent={colors.paths}>
            <SourceSelector
              sourceType={rmSourceType}
              onSourceTypeChange={setRmSourceType}
              topic={rmTopic}
              onTopicChange={setRmTopic}
              pasteText={rmPaste}
              onPasteTextChange={setRmPaste}
              url={rmUrl}
              onUrlChange={setRmUrl}
              disabled={generatingRoadmap || !serverConfigured}
              confirmedUrlSource={rmUrlSource}
              onUrlSourceConfirmed={handleRoadmapUrlConfirmed}
              onUrlSourceCleared={() => {
                setRmUrlSource(null);
                setRmSourceContext(null);
              }}
              useServerExtraction={serverExtractionEnabled}
              serverSource={rmServerSource}
              serverLoading={rmServerLoading}
              serverError={rmServerError}
              onExtractServer={() => extractRoadmapServerSource(false)}
              onClearServer={() => {
                setRmServerSource(null);
                setRmServerError(null);
              }}
              onRetryServer={() => extractRoadmapServerSource(true)}
              fileSource={rmFileSource}
              fileLoading={rmFileLoading}
              fileError={rmFileError}
              onPickFile={serverExtractionEnabled ? uploadRoadmapFile : undefined}
              onClearFile={() => {
                setRmFileSource(null);
                setRmFileError(null);
              }}
              onRetryFile={uploadRoadmapFile}
              topicPlaceholder="Roadmap topic, e.g. Operating Systems"
              topicOptional
              showTopicField={false}
              accent={colors.paths}
            />

            <RoadmapGenerationForm
              embedded
              showIntro={false}
              submitLabel="Generate roadmap"
              values={{
                topic: rmTopic,
                goal: rmGoal,
                masteryLevel: rmMastery,
                depth: rmDepth,
                lessonCount: rmLessonCount,
                slidesPerLesson: rmSlidesPerLesson,
                preferences: rmPrefs,
              }}
              onChange={(patch) => {
                if (patch.topic !== undefined) setRmTopic(patch.topic);
                if (patch.goal !== undefined) setRmGoal(patch.goal);
                if (patch.masteryLevel !== undefined) setRmMastery(patch.masteryLevel);
                if (patch.depth !== undefined) setRmDepth(patch.depth);
                if (patch.lessonCount !== undefined) setRmLessonCount(patch.lessonCount);
                if (patch.slidesPerLesson !== undefined) setRmSlidesPerLesson(patch.slidesPerLesson);
                if (patch.preferences !== undefined) setRmPrefs(patch.preferences);
              }}
              loading={generatingRoadmap}
              loadingMessage={rmLoadingMsg}
              error={rmError}
              disabled={roadmapGenerateDisabled}
              onSubmit={onGenerateRoadmap}
              onRetry={onGenerateRoadmap}
            />
          </GlassCard>
        </>
      )}

      {roadmapsHydrated && recentRoadmaps.length > 0 ? (
        <View style={styles.librarySection}>
          <SectionHeader title="Recent roadmaps" subtitle="Pick up a path you started" />
          <View style={{ gap: spacing.sm }}>
            {recentRoadmaps.map((rm) => {
              const stats = roadmapStats(rm);
              return (
                <Pressable
                  key={rm.id}
                  onPress={() => router.push(`/roadmap/${rm.id}`)}
                  style={({ pressed }) => [styles.libCard, pressed && { borderColor: colors.paths }]}
                >
                  <View style={[styles.libDot, { backgroundColor: colors.paths }]}>
                    <Ionicons name="map" size={16} color={colors.bg} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.libTitle} numberOfLines={1}>
                      {rm.title}
                    </Text>
                    <Text style={styles.libMeta} numberOfLines={1}>
                      {stats.completed} of {stats.total} lessons
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => confirmDeleteRoadmap(rm.id, rm.title)}
                    hitSlop={10}
                    style={styles.trash}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.librarySection}>
        <SectionHeader title="Generated lessons" subtitle="Saved for offline review" />
        {recentLessons.length === 0 ? (
          <GlassCard accent={colors.create}>
            <EmptyState
              icon="sparkles-outline"
              title="No generated lessons yet"
              message="Create a lesson from a topic, text, or document link."
              actionLabel="Create lesson"
              onActionPress={() => setTab('lesson')}
              accent={colors.create}
            />
          </GlassCard>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {recentLessons.map((l) => {
              const s = getSubject(l.subjectId);
              return (
                <Pressable
                  key={l.id}
                  onPress={() => router.push(`/lesson/${l.id}`)}
                  style={({ pressed }) => [styles.libCard, pressed && { borderColor: s?.accent }]}
                >
                  <View style={[styles.libDot, { backgroundColor: s?.accent ?? colors.primary }]}>
                    <Ionicons
                      name={(s?.icon as keyof typeof Ionicons.glyphMap) ?? 'sparkles'}
                      size={16}
                      color={colors.bg}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.libTitle} numberOfLines={1}>
                      {l.title}
                    </Text>
                    <Text style={styles.libMeta} numberOfLines={1}>
                      {s?.title} · {l.cards.length} slides · {l.minutes} min
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => confirmDeleteLesson(l.id, l.title)}
                    hitSlop={10}
                    style={styles.trash}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },

  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  pageTitle: {
    color: colors.text,
    fontSize: font.size.xxxl,
    fontWeight: font.weight.heavy as '800',
  },
  pageSubtitle: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 20,
    marginTop: 4,
  },
  gear: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  segmentRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.bgElevated },
  segmentText: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
  },
  segmentTextActive: {
    color: colors.text,
    fontWeight: font.weight.bold as '700',
  },

  tabIntro: { gap: 4 },
  tabTitle: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold as '700',
  },
  tabSubtitle: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 20,
  },

  setupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    ...shadow.card,
  },
  setupTitle: {
    color: colors.white,
    fontSize: font.size.md,
    fontWeight: font.weight.bold as '700',
  },
  setupText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: font.size.xs,
    lineHeight: 17,
    marginTop: 2,
  },

  fieldLabel: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
    marginBottom: spacing.sm,
  },
  subjectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  subjectChip: {
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
  subjectChipText: {
    color: colors.textMuted,
    fontWeight: font.weight.semibold as '600',
    fontSize: font.size.sm,
  },
  hint: { color: colors.textFaint, fontSize: font.size.xs, marginTop: 6 },

  depthBlock: { marginTop: spacing.lg },
  depthRow: { gap: spacing.sm },
  depthChip: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgElevated,
  },
  depthChipActive: { borderColor: colors.create, backgroundColor: colors.surfaceAlt },
  depthTitle: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold as '700',
  },
  depthHint: { color: colors.textFaint, fontSize: font.size.xs, marginTop: 2 },

  masteryBlock: { marginTop: spacing.lg },
  masteryRow: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.lg },
  masteryChip: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    minWidth: 72,
  },
  masteryChipActive: { borderColor: colors.create, backgroundColor: colors.surfaceAlt },
  masteryLevel: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
  },
  masteryName: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
  },
  recDot: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.xp,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.dangerDark,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorText: { color: colors.text, fontSize: font.size.sm, flex: 1, lineHeight: 19 },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    marginTop: spacing.lg,
    backgroundColor: colors.create,
  },
  generateDisabled: { backgroundColor: colors.surfaceAlt },
  generateText: { fontSize: font.size.md, fontWeight: font.weight.heavy as '800', color: colors.bg },

  slideStepperBlock: { gap: spacing.xs, marginTop: spacing.sm },
  slideStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xs,
    maxWidth: 160,
  },
  slideStepBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  slideStepBtnDisabled: { opacity: 0.4 },
  slideStepValue: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold as '700',
    minWidth: 28,
    textAlign: 'center',
  },

  librarySection: { gap: spacing.sm, marginTop: spacing.sm },
  libCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  libDot: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libTitle: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.bold as '700',
  },
  libMeta: { color: colors.textMuted, fontSize: font.size.xs, marginTop: 2 },
  trash: { padding: 4 },
});
