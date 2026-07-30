import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LessonDiagram } from '@/types/diagram';
import { colors, font, radius, spacing } from '@/theme/theme';

function FlowDiagram({ diagram, accent }: { diagram: LessonDiagram; accent: string }) {
  const nodes = diagram.nodes ?? [];
  if (nodes.length === 0) return null;
  return (
    <View style={styles.flowCol}>
      {nodes.map((node, i) => (
        <View key={node.id} style={styles.flowItem}>
          <View style={[styles.nodeBox, { borderColor: `${accent}88` }]}>
            <Text style={styles.nodeLabel}>{node.label}</Text>
          </View>
          {i < nodes.length - 1 ? (
            <Text style={[styles.arrow, { color: accent }]}>↓</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function SplitDiagram({ diagram, accent }: { diagram: LessonDiagram; accent: string }) {
  const leftItems = diagram.leftItems ?? [];
  const rightItems = diagram.rightItems ?? [];
  return (
    <View style={styles.splitRow}>
      <View style={[styles.splitCol, { borderColor: `${accent}55` }]}>
        <Text style={[styles.splitTitle, { color: accent }]}>{diagram.leftTitle ?? 'Left'}</Text>
        {leftItems.map((item) => (
          <Text key={item} style={styles.splitItem}>• {item}</Text>
        ))}
      </View>
      <Text style={[styles.splitDivider, { color: accent }]}>↔</Text>
      <View style={[styles.splitCol, { borderColor: `${accent}55` }]}>
        <Text style={[styles.splitTitle, { color: accent }]}>{diagram.rightTitle ?? 'Right'}</Text>
        {rightItems.map((item) => (
          <Text key={item} style={styles.splitItem}>• {item}</Text>
        ))}
      </View>
    </View>
  );
}

function TimelineDiagram({ diagram, accent }: { diagram: LessonDiagram; accent: string }) {
  const steps = diagram.steps ?? [];
  return (
    <View style={styles.timeline}>
      {steps.map((step, i) => (
        <View key={`${i}-${step}`} style={styles.timelineRow}>
          <View style={[styles.timelineDot, { backgroundColor: accent }]} />
          <View style={styles.timelineContent}>
            <Text style={[styles.timelineNum, { color: accent }]}>Step {i + 1}</Text>
            <Text style={styles.timelineText}>{step}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function HierarchyDiagram({ diagram, accent }: { diagram: LessonDiagram; accent: string }) {
  const nodes = diagram.nodes ?? [];
  if (nodes.length === 0) return null;
  const root = nodes[0];
  const children = nodes.slice(1);
  return (
    <View style={styles.hierarchy}>
      <View style={[styles.nodeBox, styles.hierarchyRoot, { borderColor: accent }]}>
        <Text style={styles.nodeLabel}>{root.label}</Text>
      </View>
      {children.length > 0 ? (
        <View style={styles.hierarchyChildren}>
          {children.map((child) => (
            <View key={child.id} style={styles.hierarchyBranch}>
              <Text style={[styles.branchLine, { color: accent }]}>├</Text>
              <View style={[styles.nodeBox, { borderColor: `${accent}66` }]}>
                <Text style={styles.nodeLabel}>{child.label}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function IoDiagram({ diagram, accent }: { diagram: LessonDiagram; accent: string }) {
  return (
    <View style={styles.ioRow}>
      <View style={[styles.ioBox, { borderColor: `${accent}88` }]}>
        <Text style={[styles.ioKicker, { color: accent }]}>IN</Text>
        <Text style={styles.ioLabel}>{diagram.inputLabel ?? 'Input'}</Text>
      </View>
      <Text style={[styles.arrow, { color: accent }]}>→</Text>
      <View style={[styles.ioBox, { borderColor: `${accent}88` }]}>
        <Text style={[styles.ioKicker, { color: accent }]}>OUT</Text>
        <Text style={styles.ioLabel}>{diagram.outputLabel ?? 'Output'}</Text>
      </View>
    </View>
  );
}

function AsciiDiagram({ ascii }: { ascii: string }) {
  return (
    <View style={styles.asciiBox}>
      <Text style={styles.asciiText} selectable>
        {ascii}
      </Text>
    </View>
  );
}

export function DiagramView({
  diagram,
  accent,
}: {
  diagram: LessonDiagram;
  accent: string;
}) {
  return (
    <View style={[styles.panel, { borderColor: `${accent}55` }]}>
      {diagram.kind === 'split' ? <SplitDiagram diagram={diagram} accent={accent} /> : null}
      {diagram.kind === 'timeline' ? <TimelineDiagram diagram={diagram} accent={accent} /> : null}
      {diagram.kind === 'hierarchy' ? <HierarchyDiagram diagram={diagram} accent={accent} /> : null}
      {diagram.kind === 'io' ? <IoDiagram diagram={diagram} accent={accent} /> : null}
      {diagram.kind === 'flow' ? <FlowDiagram diagram={diagram} accent={accent} /> : null}
      {diagram.kind === 'ascii' && diagram.ascii ? <AsciiDiagram ascii={diagram.ascii} /> : null}
      {diagram.ascii && diagram.kind !== 'ascii' ? (
        <AsciiDiagram ascii={diagram.ascii} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  flowCol: { alignItems: 'center', gap: spacing.xs },
  flowItem: { alignItems: 'center' },
  nodeBox: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgElevated,
    minWidth: 140,
    maxWidth: '100%',
  },
  nodeLabel: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  arrow: { fontSize: 22, fontWeight: '700', marginVertical: 2 },
  splitRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  splitCol: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.bgElevated,
  },
  splitTitle: { fontSize: font.size.xs, fontWeight: '800', textTransform: 'uppercase' },
  splitItem: { color: colors.text, fontSize: font.size.sm, lineHeight: 20 },
  splitDivider: { alignSelf: 'center', fontSize: 20, fontWeight: '700' },
  timeline: { gap: spacing.md },
  timelineRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  timelineContent: { flex: 1, gap: 2 },
  timelineNum: { fontSize: font.size.xs, fontWeight: '800' },
  timelineText: { color: colors.text, fontSize: font.size.sm, lineHeight: 20 },
  hierarchy: { gap: spacing.md, alignItems: 'center' },
  hierarchyRoot: { minWidth: 180 },
  hierarchyChildren: { width: '100%', gap: spacing.sm, paddingLeft: spacing.lg },
  hierarchyBranch: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  branchLine: { fontSize: font.size.lg, width: 16 },
  ioRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  ioBox: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bgElevated,
  },
  ioKicker: { fontSize: font.size.xs, fontWeight: '800', letterSpacing: 1 },
  ioLabel: { color: colors.text, fontSize: font.size.sm, textAlign: 'center' },
  asciiBox: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  asciiText: {
    fontFamily: 'Menlo',
    fontSize: font.size.xs,
    lineHeight: 16,
    color: colors.text,
  },
});
