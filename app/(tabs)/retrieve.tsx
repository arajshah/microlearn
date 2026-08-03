import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { MonthlyReviewCalendar } from '@/components/retrieval/MonthlyReviewCalendar';
import { ActionCard, AppScreen, EmptyState, GlassCard, PrimaryButton, SectionHeader } from '@/components/ui';
import { setRetrievalSessionCache } from '@/retrieval/sessionCache';
import { groupReviewItems, ReviewGroup, ScheduledItem } from '@/retrieval/reviewGroups';
import { removeReviewGroup } from '@/services/retrievalDelete';
import {
  createRetrievalSession,
  getDailyActivity,
  getDueRetrievalItems,
  getRetrievalSchedule,
  getRetrievalSummary,
  isServerConfigured,
  ServerDailyActivity,
  ServerRetrievalItem,
  ServerRetrievalScheduleItem,
  ServerRetrievalSummary,
} from '@/services/microlearnServer';
import {
  filterRetrievalItems,
  readDeletedRetrievalItemIds,
  readDeletedReviewSetIds,
} from '@/storage/retrievalTombstones';
import { dayKey } from '@/utils/date';
import { colors, font, radius, spacing } from '@/theme/theme';
import { useScreenRefresh } from '@/hooks/useScreenRefresh';

function formatDue(value: string): string {
  const d = new Date(value);
  const now = new Date();
  if (dayKey(d) === dayKey(now)) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function groupHasDueNow(group: ReviewGroup): boolean {
  const now = Date.now();
  return group.items.some((item) => new Date(item.dueAt).getTime() <= now);
}

function daysThroughMonthEnd(from: Date): number {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const afterMonth = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return Math.max(1, Math.ceil((afterMonth.getTime() - start.getTime()) / 86_400_000));
}

function selectedDateLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return 'Today';
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString([], { month: 'long', day: 'numeric' });
}

export default function RetrieveScreen() {
  const router = useRouter();
  const serverEnabled = isServerConfigured();

  const [serverDue, setServerDue] = useState<ServerRetrievalItem[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ServerRetrievalScheduleItem[]>([]);
  const [serverSummary, setServerSummary] = useState<ServerRetrievalSummary | null>(null);
  const [activity, setActivity] = useState<ServerDailyActivity[]>([]);
  const [serverLoading, setServerLoading] = useState(serverEnabled);
  const [starting, setStarting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(dayKey(new Date()));

  const loadRetrieval = useCallback(async () => {
    if (!serverEnabled) {
      setServerLoading(false);
      return;
    }
    try {
      const [deletedReviewSets, deletedItems, due, summary, schedule, activityDays] = await Promise.all([
        readDeletedReviewSetIds(),
        readDeletedRetrievalItemIds(),
        getDueRetrievalItems({ limit: 50 }),
        getRetrievalSummary(),
        getRetrievalSchedule({ days: daysThroughMonthEnd(new Date()) }),
        getDailyActivity(35),
      ]);
      setServerDue(filterRetrievalItems(due, deletedReviewSets, deletedItems));
      setScheduleItems(filterRetrievalItems(schedule, deletedReviewSets, deletedItems));
      setServerSummary(summary);
      setActivity(activityDays);
    } finally {
      setServerLoading(false);
    }
  }, [serverEnabled]);

  const { refreshing, refresh } = useScreenRefresh(loadRetrieval);

  const todayKey = dayKey(new Date());
  const scheduleByDay = useMemo(() => {
    const map = new Map<string, ServerRetrievalScheduleItem[]>();
    for (const item of scheduleItems) {
      const key = dayKey(new Date(item.dueAt));
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [scheduleItems]);

  const todayScheduled = scheduleByDay.get(todayKey) ?? [];
  const todayGroups = useMemo(
    () => groupReviewItems(todayScheduled.length === 0 ? serverDue : todayScheduled),
    [serverDue, todayScheduled],
  );
  const todayCount = todayGroups.length;
  const dueCountsByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [key, items] of scheduleByDay.entries()) {
      counts[key] = groupReviewItems(items).length;
    }
    counts[todayKey] = Math.max(counts[todayKey] ?? 0, groupReviewItems(serverDue).length);
    return counts;
  }, [scheduleByDay, serverDue, todayKey]);
  const completedDates = useMemo(
    () =>
      new Set(
        activity
          .filter((day) => day.retrievalItemsReviewed > 0)
          .map((day) => day.day),
      ),
    [activity],
  );
  const selectedScheduleItems =
    selectedDay === todayKey && todayScheduled.length === 0
      ? serverDue
      : scheduleByDay.get(selectedDay) ?? [];
  const selectedGroups = useMemo(
    () => groupReviewItems(selectedScheduleItems),
    [selectedScheduleItems],
  );
  const selectedIsToday = selectedDay === todayKey;
  const selectedLabel = selectedDateLabel(selectedDay, todayKey);
  const hasServerDueNow = serverDue.length > 0;
  const selectedHasDueNow = selectedIsToday && hasServerDueNow;
  const hasAnySchedule = todayGroups.length > 0 || selectedGroups.length > 0 || serverDue.length > 0;

  const startItems = useCallback(async (items: ScheduledItem[]) => {
    if (starting) return;
    const ids = items.map((i) => i.id);
    if (ids.length > 0) {
      setStarting(true);
      const result = await createRetrievalSession(ids);
      setStarting(false);
      if (!result) return;
      setRetrievalSessionCache({
        sessionId: result.session.id,
        session: result.session,
        items: result.items,
      });
      router.push({ pathname: '/retrieve-session', params: { sessionId: result.session.id } });
    }
  }, [router, starting]);

  const onStart = useCallback(async () => {
    if (hasServerDueNow) await startItems(serverDue);
  }, [hasServerDueNow, serverDue, startItems]);

  const removeGroupLocally = useCallback((group: ReviewGroup) => {
    const itemIds = new Set(group.items.map((item) => item.id));
    setServerDue((prev) => prev.filter((item) => !itemIds.has(item.id)));
    setScheduleItems((prev) => prev.filter((item) => !itemIds.has(item.id)));
  }, []);

  const confirmDeleteGroup = useCallback(
    (group: ReviewGroup) => {
      Alert.alert('Remove this from review?', 'This review set will be removed from your schedule.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setDeletingId(group.id);
            removeGroupLocally(group);
            removeReviewGroup({
              reviewSetId: group.reviewSetId,
              itemIds: group.items.map((item) => item.id),
            })
              .catch(() => {})
              .finally(() => setDeletingId(null));
          },
        },
      ]);
    },
    [removeGroupLocally],
  );

  const heroTitle = todayCount > 0 ? 'Due today' : 'Nothing due today';
  const heroSubtitle =
    todayCount > 0
      ? `${todayCount} review set${todayCount === 1 ? '' : 's'} scheduled for today.`
      : hasAnySchedule
        ? 'Check the calendar below for upcoming reviews.'
        : 'No reviews yet. Add a completed lesson to review.';

  return (
    <AppScreen
      scroll
      contentStyle={styles.content}
      refresh={{ refreshing, onRefresh: refresh, accent: colors.retrieve }}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Retrieve</Text>
        <Text style={styles.subtitle}>Review what is scheduled.</Text>
      </View>

      <GlassCard accent={colors.retrieve} elevated padding={spacing.xl}>
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <Ionicons name="calendar-outline" size={24} color={colors.retrieve} />
          </View>
          {serverLoading ? <ActivityIndicator color={colors.retrieve} /> : null}
        </View>
        <Text style={styles.heroKicker}>{heroTitle}</Text>
        <Text style={styles.heroCount}>{todayCount}</Text>
        <Text style={styles.heroText}>{heroSubtitle}</Text>
        <PrimaryButton
          label="Start today's review"
          icon={starting ? undefined : 'arrow-forward'}
          accent={colors.retrieve}
          onPress={onStart}
          disabled={starting || !hasServerDueNow || !serverEnabled}
          style={styles.heroButton}
        />
        {!serverEnabled ? (
          <Text style={styles.softNote}>Retrieval scheduling is unavailable right now.</Text>
        ) : !hasServerDueNow && todayCount > 0 ? (
          <Text style={styles.softNote}>Reviews scheduled later today will appear here when due.</Text>
        ) : null}
      </GlassCard>

      <View style={styles.section}>
        <SectionHeader
          title="Review calendar"
          subtitle="Objects in orbit — see what is due this month."
        />
        <GlassCard accent={colors.retrieve} padding={spacing.md}>
          <MonthlyReviewCalendar
            monthDate={new Date()}
            selectedDateKey={selectedDay}
            dueCountsByDate={dueCountsByDate}
            completedDates={completedDates}
            onSelectDate={setSelectedDay}
            accent={colors.retrieve}
          />
        </GlassCard>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title={selectedIsToday ? 'Reviews for Today' : `Reviews for ${selectedLabel}`}
          subtitle={
            selectedGroups.length > 0 && !selectedIsToday
              ? 'Scheduled for this day.'
              : undefined
          }
        />
        {selectedHasDueNow ? (
          <PrimaryButton
            label="Start today's review"
            icon={starting ? undefined : 'arrow-forward'}
            accent={colors.retrieve}
            onPress={onStart}
            disabled={starting}
          />
        ) : null}
        {selectedGroups.length > 0 ? (
          <View style={styles.reviewList}>
            {selectedGroups.map((group) => (
              <GlassCard key={group.id} accent={colors.retrieve} padding={spacing.md}>
                <View style={styles.reviewItem}>
                  <View style={styles.reviewIcon}>
                    <Ionicons name="repeat-outline" size={17} color={colors.retrieve} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.reviewTitleRow}>
                      <Text style={styles.reviewTitle} numberOfLines={1}>
                        {group.title}
                      </Text>
                      <Text style={styles.reviewTime}>{formatDue(group.dueAt)}</Text>
                      <Pressable
                        onPress={() => confirmDeleteGroup(group)}
                        disabled={deletingId === group.id}
                        hitSlop={8}
                        style={styles.deleteBtn}
                        accessibilityLabel="Remove from review"
                      >
                        {deletingId === group.id ? (
                          <ActivityIndicator size="small" color={colors.textFaint} />
                        ) : (
                          <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
                        )}
                      </Pressable>
                    </View>
                    <Text style={styles.reviewPrompt} numberOfLines={2}>
                      {group.items.length} prompt{group.items.length === 1 ? '' : 's'} due
                    </Text>
                    <View style={styles.reviewFooter}>
                      <Text style={styles.reviewMeta}>{group.sourceLabel}</Text>
                      {selectedIsToday && groupHasDueNow(group) ? (
                        <PrimaryButton
                          label="Start review"
                          accent={colors.retrieve}
                          onPress={() => startItems(group.items)}
                          disabled={starting}
                          style={styles.groupStart}
                        />
                      ) : null}
                    </View>
                  </View>
                </View>
              </GlassCard>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="calendar-clear-outline"
            title={selectedIsToday ? 'No reviews yet' : 'No reviews scheduled for this day'}
            message={
              selectedIsToday
                ? 'Add a completed lesson to review.'
                : hasAnySchedule
                  ? 'Pick another day to see upcoming retrieval items.'
                  : 'Add a completed lesson to review.'
            }
            actionLabel={selectedIsToday && !hasAnySchedule ? 'Browse Paths' : undefined}
            onActionPress={
              selectedIsToday && !hasAnySchedule ? () => router.push('/learn') : undefined
            }
            accent={colors.retrieve}
          />
        )}
      </View>

      {!hasAnySchedule ? (
        <View style={styles.section}>
          <SectionHeader title="Add lessons" />
          <ActionCard
            title="Create Lesson"
            subtitle="Generate a lesson, then add it to review from the completion screen."
            icon="sparkles-outline"
            accent={colors.create}
            onPress={() => router.push('/create')}
          />
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
  header: {
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: font.size.display,
    fontWeight: font.weight.heavy as '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: font.size.md,
    lineHeight: 22,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: `${colors.retrieve}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroKicker: {
    color: colors.text,
    fontSize: font.size.xl,
    fontWeight: font.weight.heavy as '800',
    marginTop: spacing.lg,
  },
  heroCount: {
    color: colors.text,
    fontSize: 64,
    lineHeight: 70,
    fontWeight: font.weight.heavy as '800',
  },
  heroText: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  heroButton: {
    marginTop: spacing.lg,
  },
  softNote: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    lineHeight: 17,
    marginTop: spacing.md,
  },
  section: {
    gap: spacing.md,
  },
  reviewList: {
    gap: spacing.md,
  },
  reviewItem: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  reviewIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: `${colors.retrieve}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reviewTitle: {
    flex: 1,
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.bold as '700',
  },
  reviewTime: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold as '700',
    flexShrink: 0,
  },
  deleteBtn: {
    padding: 2,
    marginLeft: 2,
  },
  reviewPrompt: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 19,
    marginTop: 3,
  },
  reviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  reviewMeta: {
    color: colors.retrieve,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
  },
  groupStart: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
