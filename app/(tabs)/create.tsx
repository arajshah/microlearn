import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MASTERY_TIERS, MasteryLevel } from '@/data/mastery';
import { useLibrary } from '@/context/LibraryContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useProgress } from '@/context/ProgressContext';
import { useRoadmaps } from '@/context/RoadmapContext';
import { getSubject, subjects } from '@/data/courses';
import { SubjectId } from '@/types/content';
import { RoadmapDepth } from '@/types/roadmap';
import { suggestedMasteryLevel } from '@/utils/adaptive';
import { resolveGeminiApiKey } from '@/utils/geminiKey';
import { formatSourceAsText } from '@/utils/urlSourceContext';
import { RoadmapGenerationForm } from '@/components/roadmap/RoadmapGenerationForm';
import { UrlImportPanel } from '@/components/create/UrlImportPanel';
import { ExtractedUrlSource, RoadmapSourceContext } from '@/types/urlSource';
import { roadmapStats } from '@/utils/roadmapProgress';
import { colors, font, radius, shadow, spacing } from '@/theme/theme';

type Mode = 'topic' | 'source';
type CreateTab = 'lesson' | 'roadmap';

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hasKey, hydrated, config, generate, generatedLessons, deleteLesson } = useLibrary();
  const { level } = usePreferences();
  const { subjectProgress } = useProgress();
  const {
    roadmaps,
    generatingRoadmap,
    generateRoadmapFlow,
    deleteRoadmap,
    hydrated: roadmapsHydrated,
  } = useRoadmaps();

  const [createTab, setCreateTab] = useState<CreateTab>('lesson');
  const [mode, setMode] = useState<Mode>('topic');
  const [subjectId, setSubjectId] = useState<SubjectId>(subjects[0].id);
  const [topic, setTopic] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [url, setUrl] = useState('');
  const [urlSource, setUrlSource] = useState<ExtractedUrlSource | null>(null);
  const [sourceContext, setSourceContext] = useState<RoadmapSourceContext | null>(null);
  const [masteryLevel, setMasteryLevel] = useState<MasteryLevel>(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rmTopic, setRmTopic] = useState('');
  const [rmGoal, setRmGoal] = useState('');
  const [rmMastery, setRmMastery] = useState<MasteryLevel>(level);
  const [rmDepth, setRmDepth] = useState<RoadmapDepth>('standard');
  const [rmPrefs, setRmPrefs] = useState('');
  const [rmUrl, setRmUrl] = useState('');
  const [rmUrlSource, setRmUrlSource] = useState<ExtractedUrlSource | null>(null);
  const [rmSourceContext, setRmSourceContext] = useState<RoadmapSourceContext | null>(null);
  const [rmError, setRmError] = useState<string | null>(null);
  const [rmLoadingMsg, setRmLoadingMsg] = useState('Designing your learning path…');

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

  const geminiKey = resolveGeminiApiKey(config);

  const onGenerateRoadmap = async () => {
    if (generatingRoadmap) return;
    if (!rmTopic.trim() || !rmGoal.trim()) {
      setRmError('Topic and learning goal are required.');
      return;
    }
    setRmError(null);
    setRmLoadingMsg(
      rmSourceContext ? 'Building your roadmap from source…' : 'Mapping units and lesson sequence…',
    );
    try {
      const roadmap = await generateRoadmapFlow({
        topic: rmTopic.trim(),
        goal: rmGoal.trim(),
        masteryLevel: rmMastery,
        depth: rmDepth,
        preferences: rmPrefs.trim() || undefined,
        sourceUrl: rmUrlSource?.originalUrl ?? rmSourceContext?.sourceUrl,
        sourceExtractionId: rmUrlSource?.id,
        sourceContext: rmSourceContext ?? undefined,
      });
      router.push(`/roadmap/${roadmap.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not generate roadmap.';
      setRmError(msg);
    }
  };

  const handleLessonSourceConfirmed = (
    source: ExtractedUrlSource,
    context: RoadmapSourceContext,
  ) => {
    setUrlSource(source);
    setSourceContext(context);
    setSourceText(formatSourceAsText(context, topic));
    if (!topic.trim()) setTopic(source.suggestedTopic);
  };

  const handleRoadmapSourceConfirmed = (
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

  const onGenerate = async () => {
    const hasPastedText = sourceText.trim().length >= 80;
    const hasUrlSource = Boolean(sourceContext);
    if (mode === 'source' && !hasPastedText && !hasUrlSource) {
      setError('Paste text, or read a URL to use as source material.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const lesson = await generate({
        subjectId,
        topic,
        masteryLevel,
        sourceText:
          mode === 'source'
            ? sourceContext
              ? formatSourceAsText(sourceContext, topic)
              : sourceText
            : undefined,
        sourceUrl: urlSource?.originalUrl ?? sourceContext?.sourceUrl,
        sourceTitle: urlSource?.title ?? sourceContext?.sourceTitle,
      });
      setTopic('');
      setSourceText('');
      setUrl('');
      setUrlSource(null);
      setSourceContext(null);
      router.push(`/lesson/${lesson.id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Try again.';
      console.warn('[AI] Lesson generation failed:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = (id: string, title: string) => {
    Alert.alert('Delete lesson?', `Remove "${title}" from your library?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteLesson(id) },
    ]);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Create</Text>
          <Text style={styles.subtitle}>
            {createTab === 'lesson'
              ? 'Generate a lesson from a topic or your own text'
              : 'Build a structured learning path toward a goal'}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/settings')} style={styles.gear} hitSlop={10}>
          <Ionicons name="settings-outline" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {hydrated && !hasKey ? (
        <Pressable onPress={() => router.push('/settings')}>
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.setupCard}
          >
            <Ionicons name="key" size={26} color={colors.white} />
            <View style={{ flex: 1 }}>
              <Text style={styles.setupTitle}>Connect an AI model</Text>
              <Text style={styles.setupText}>
                Add a free API key (Groq, OpenRouter, Together…) to start generating
                lessons. Tap to set it up.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.white} />
          </LinearGradient>
        </Pressable>
      ) : null}

      <View style={styles.segment}>
        {(['lesson', 'roadmap'] as CreateTab[]).map((t) => {
          const active = createTab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setCreateTab(t)}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
            >
              <Ionicons
                name={t === 'lesson' ? 'document-text-outline' : 'map-outline'}
                size={15}
                color={active ? colors.bg : colors.textMuted}
              />
              <Text style={[styles.segmentText, active && { color: colors.bg }]}>
                {t === 'lesson' ? 'Single lesson' : 'Roadmap'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {createTab === 'roadmap' ? (
        <View style={{ gap: spacing.lg }}>
          <UrlImportPanel
            apiKey={geminiKey}
            url={rmUrl}
            onUrlChange={setRmUrl}
            disabled={generatingRoadmap || !hasKey}
            confirmedSource={rmUrlSource}
            onSourceConfirmed={handleRoadmapSourceConfirmed}
            onSourceCleared={() => {
              setRmUrlSource(null);
              setRmSourceContext(null);
            }}
          />
          <RoadmapGenerationForm
            values={{
              topic: rmTopic,
              goal: rmGoal,
              masteryLevel: rmMastery,
              depth: rmDepth,
              preferences: rmPrefs,
            }}
            onChange={(patch) => {
              if (patch.topic !== undefined) setRmTopic(patch.topic);
              if (patch.goal !== undefined) setRmGoal(patch.goal);
              if (patch.masteryLevel !== undefined) setRmMastery(patch.masteryLevel);
              if (patch.depth !== undefined) setRmDepth(patch.depth);
              if (patch.preferences !== undefined) setRmPrefs(patch.preferences);
            }}
            loading={generatingRoadmap}
            loadingMessage={rmLoadingMsg}
            error={rmError}
            disabled={!hasKey || !rmTopic.trim() || !rmGoal.trim()}
            onSubmit={onGenerateRoadmap}
            onRetry={onGenerateRoadmap}
          />
        </View>
      ) : (
      <View style={styles.card}>
        {/* Mode switch */}
        <View style={styles.segment}>
          {(['topic', 'source'] as Mode[]).map((m) => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              >
                <Ionicons
                  name={m === 'topic' ? 'bulb-outline' : 'document-text-outline'}
                  size={15}
                  color={active ? colors.bg : colors.textMuted}
                />
                <Text style={[styles.segmentText, active && { color: colors.bg }]}>
                  {m === 'topic' ? 'From a topic' : 'From text'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { marginTop: spacing.lg }]}>Subject</Text>
        <View style={styles.subjectChipRow}>
          {subjects.map((s) => {
            const active = s.id === subjectId;
            return (
              <Pressable
                key={s.id}
                onPress={() => setSubjectId(s.id)}
                style={[
                  styles.chip,
                  active && { backgroundColor: s.accent, borderColor: s.accent },
                ]}
              >
                <Ionicons
                  name={s.icon as any}
                  size={14}
                  color={active ? colors.bg : colors.textMuted}
                />
                <Text style={[styles.chipText, active && { color: colors.bg }]}>
                  {s.title}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'topic' ? (
          <>
            <Text style={[styles.label, { marginTop: spacing.lg }]}>Topic</Text>
            <TextInput
              value={topic}
              onChangeText={setTopic}
              placeholder={`e.g. "${topicHint(subjectId)}"`}
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              editable={!loading}
              returnKeyType="done"
            />
            <Text style={styles.hint}>Leave blank for a general {subject.title} lesson.</Text>
          </>
        ) : (
          <>
            <UrlImportPanel
              apiKey={geminiKey}
              url={url}
              onUrlChange={setUrl}
              disabled={loading || !hasKey}
              confirmedSource={urlSource}
              onSourceConfirmed={handleLessonSourceConfirmed}
              onSourceCleared={() => {
                setUrlSource(null);
                setSourceContext(null);
                if (urlSource && sourceText.includes(urlSource.title)) {
                  setSourceText('');
                }
              }}
            />

            <Text style={[styles.label, { marginTop: spacing.lg }]}>
              Or paste text {sourceText ? `· ${sourceText.length} chars` : ''}
            </Text>
            <TextInput
              value={sourceText}
              onChangeText={setSourceText}
              placeholder="Paste an article, your notes, or anything you want to learn…"
              placeholderTextColor={colors.textFaint}
              style={[styles.input, styles.textArea]}
              editable={!loading}
              multiline
              textAlignVertical="top"
            />
            <Text style={[styles.label, { marginTop: spacing.lg }]}>Focus (optional)</Text>
            <TextInput
              value={topic}
              onChangeText={setTopic}
              placeholder="Narrow it down, e.g. 'the causes only'"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              editable={!loading}
              returnKeyType="done"
            />
          </>
        )}

        <Text style={[styles.label, { marginTop: spacing.lg }]}>Mastery level</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {MASTERY_TIERS.map((tier) => {
            const active = tier.level === masteryLevel;
            const isRec = tier.level === recommended;
            return (
              <Pressable
                key={tier.level}
                onPress={() => setMasteryLevel(tier.level)}
                style={[
                  styles.masteryChip,
                  active && { backgroundColor: colors.surfaceAlt, borderColor: colors.primary },
                ]}
              >
                <Text style={[styles.masteryLevel, active && { color: colors.primary }]}>
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
          ★ Recommended: Level {recommended} ({MASTERY_TIERS.find((t) => t.level === recommended)?.name}) — longer, richer lessons at higher levels.
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={onGenerate}
          disabled={loading || !hasKey}
          style={[
            styles.generateBtn,
            { backgroundColor: hasKey ? subject.accent : colors.surfaceAlt },
          ]}
        >
          {loading ? (
            <>
              <ActivityIndicator color={colors.bg} />
              <Text style={[styles.generateText, { color: colors.bg }]}>Generating…</Text>
            </>
          ) : (
            <>
              <Ionicons
                name="sparkles"
                size={18}
                color={hasKey ? colors.bg : colors.textFaint}
              />
              <Text
                style={[
                  styles.generateText,
                  { color: hasKey ? colors.bg : colors.textFaint },
                ]}
              >
                {!hasKey
                  ? 'Add an API key first'
                  : mode === 'source'
                    ? 'Generate from text'
                    : 'Generate lesson'}
              </Text>
            </>
          )}
        </Pressable>
      </View>
      )}

      {roadmapsHydrated && roadmaps.length > 0 ? (
        <>
          <View style={styles.libHead}>
            <Text style={styles.sectionTitle}>My roadmaps</Text>
            <Text style={styles.sectionMeta}>{roadmaps.length}</Text>
          </View>
          <View style={{ gap: spacing.md }}>
            {roadmaps.map((rm) => {
              const stats = roadmapStats(rm);
              return (
                <Pressable
                  key={rm.id}
                  onPress={() => router.push(`/roadmap/${rm.id}`)}
                  style={({ pressed }) => [styles.libCard, pressed && { borderColor: colors.primary }]}
                >
                  <View style={[styles.libDot, { backgroundColor: colors.primary }]}>
                    <Ionicons name="map" size={16} color={colors.bg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.libTitle} numberOfLines={1}>
                      {rm.title}
                    </Text>
                    <Text style={styles.libMeta} numberOfLines={1}>
                      {stats.completed}/{stats.total} lessons · {rm.depth}
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
        </>
      ) : null}

      {/* Library */}
      <View style={styles.libHead}>
        <Text style={styles.sectionTitle}>Your AI lessons</Text>
        <Text style={styles.sectionMeta}>{generatedLessons.length}</Text>
      </View>

      {generatedLessons.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="sparkles-outline" size={28} color={colors.textFaint} />
          <Text style={styles.emptyText}>
            Lessons you generate appear here and stay available offline.
          </Text>
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {generatedLessons.map((l) => {
            const s = getSubject(l.subjectId);
            return (
              <Pressable
                key={l.id}
                onPress={() => router.push(`/lesson/${l.id}`)}
                style={({ pressed }) => [styles.libCard, pressed && { borderColor: s?.accent }]}
              >
                <View style={[styles.libDot, { backgroundColor: s?.accent ?? colors.primary }]}>
                  <Ionicons name={(s?.icon as any) ?? 'sparkles'} size={16} color={colors.bg} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.libTitle} numberOfLines={1}>
                    {l.title}
                  </Text>
                  <Text style={styles.libMeta} numberOfLines={1}>
                    {s?.title} · {l.cards.length} cards · {l.minutes} min
                  </Text>
                </View>
                <Pressable
                  onPress={() => confirmDelete(l.id, l.title)}
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
    </ScrollView>
  );
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: {
    color: colors.text,
    fontSize: font.size.xxl,
    fontWeight: font.weight.heavy as '800',
  },
  subtitle: { color: colors.textMuted, fontSize: font.size.sm, marginTop: 2 },
  gear: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  setupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
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

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold as '700',
  },
  label: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.lg },
  subjectChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  masteryChip: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 72,
  },
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    color: colors.textMuted,
    fontWeight: font.weight.semibold as '600',
    fontSize: font.size.sm,
  },
  recDot: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.xp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: font.size.md,
  },
  textArea: { minHeight: 140, paddingTop: spacing.md, lineHeight: 21 },
  hint: { color: colors.textFaint, fontSize: font.size.xs, marginTop: 6 },
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
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
  generateText: { fontSize: font.size.md, fontWeight: font.weight.heavy as '800' },

  libHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold as '700',
  },
  sectionMeta: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderStyle: 'dashed',
  },
  emptyText: {
    color: colors.textFaint,
    fontSize: font.size.sm,
    textAlign: 'center',
    lineHeight: 19,
  },
  libCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
