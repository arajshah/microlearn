import React from 'react';
import { StyleSheet, Text, TextStyle, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme/theme';
import { latexToTokens } from '@/utils/latexDisplay';
import { splitMathSegments } from '@/utils/mathSegments';
import {
  InlineSegment,
  MarkdownBlock,
  parseInlineSegments,
  parseMarkdownBlocks,
} from '@/utils/markdownBlocks';

type RichContentProps = {
  children: string;
  style?: TextStyle;
  accent?: string;
  /** Larger base size for headings inside content. */
  variant?: 'body' | 'title' | 'caption';
};

function MathTokens({
  latex,
  block,
  baseStyle,
  accent,
}: {
  latex: string;
  block: boolean;
  baseStyle: TextStyle;
  accent?: string;
}) {
  const tokens = latexToTokens(latex);
  const content = (
    <Text
      style={[
        baseStyle,
        block && styles.mathBlock,
        { color: block ? colors.text : accent ?? colors.text, fontFamily: 'Menlo' },
      ]}
    >
      {tokens.map((token, i) => {
        if (token.kind === 'frac') {
          return (
            <Text key={i}>
              <Text style={styles.fracNum}>{token.num}</Text>
              <Text style={styles.fracBar}>────</Text>
              <Text style={styles.fracDen}>{token.den}</Text>
            </Text>
          );
        }
        if (token.kind === 'sup') {
          return (
            <Text key={i} style={styles.sup}>
              {token.value}
            </Text>
          );
        }
        if (token.kind === 'sub') {
          return (
            <Text key={i} style={styles.sub}>
              {token.value}
            </Text>
          );
        }
        return <Text key={i}>{token.value}</Text>;
      })}
    </Text>
  );

  if (block) {
    return (
      <View style={[styles.mathBlockWrap, accent ? { borderLeftColor: accent } : null]}>
        {content}
      </View>
    );
  }
  return content;
}

function InlineRich({
  text,
  baseStyle,
  accent,
}: {
  text: string;
  baseStyle: TextStyle;
  accent?: string;
}) {
  const segments = parseInlineSegments(text);
  return (
    <Text style={baseStyle}>
      {segments.flatMap((seg, segIdx) => {
        const mathParts = splitMathSegments(seg.text);
        return mathParts.map((part, partIdx) => {
          const key = `${segIdx}-${partIdx}`;
          if (part.type === 'math') {
            return (
              <MathTokens
                key={key}
                latex={part.content}
                block={part.block}
                baseStyle={baseStyle}
                accent={accent}
              />
            );
          }
          const styled: TextStyle = {};
          if (seg.styles.includes('bold')) styled.fontWeight = '700';
          if (seg.styles.includes('italic')) styled.fontStyle = 'italic';
          if (seg.styles.includes('code')) {
            styled.fontFamily = 'Menlo';
            styled.backgroundColor = colors.bgElevated;
            styled.color = colors.success;
          }
          return (
            <Text key={key} style={styled}>
              {part.content}
            </Text>
          );
        });
      })}
    </Text>
  );
}

function BlockView({
  block,
  baseStyle,
  accent,
}: {
  block: MarkdownBlock;
  baseStyle: TextStyle;
  accent?: string;
}) {
  if (block.type === 'heading') {
    const size =
      block.level === 1 ? font.size.xl : block.level === 2 ? font.size.lg : font.size.md;
    return (
      <InlineRich
        text={block.text}
        baseStyle={{
          ...baseStyle,
          fontSize: size,
          fontWeight: '800',
          color: colors.text,
          marginTop: spacing.sm,
        }}
        accent={accent}
      />
    );
  }

  if (block.type === 'bullet') {
    return (
      <View style={styles.list}>
        {block.items.map((item) => (
          <View key={item} style={styles.listRow}>
            <Text style={[baseStyle, styles.bullet]}>•</Text>
            <InlineRich text={item} baseStyle={{ ...baseStyle, ...styles.listItem }} accent={accent} />
          </View>
        ))}
      </View>
    );
  }

  if (block.type === 'numbered') {
    return (
      <View style={styles.list}>
        {block.items.map((item, idx) => (
          <View key={`${idx}-${item}`} style={styles.listRow}>
            <Text style={[baseStyle, styles.bullet]}>{idx + 1}.</Text>
            <InlineRich text={item} baseStyle={{ ...baseStyle, ...styles.listItem }} accent={accent} />
          </View>
        ))}
      </View>
    );
  }

  if (block.type === 'code') {
    return (
      <View style={styles.codeBlock}>
        <Text style={styles.codeText} selectable>
          {block.text}
        </Text>
      </View>
    );
  }

  if (block.type === 'quote') {
    return (
      <View style={[styles.quoteBlock, accent ? { borderLeftColor: accent } : null]}>
        <InlineRich text={block.text} baseStyle={baseStyle} accent={accent} />
      </View>
    );
  }

  return <InlineRich text={block.text} baseStyle={baseStyle} accent={accent} />;
}

/** Rich lesson text: markdown blocks + inline math (no raw HTML). */
export function RichContent({ children, style, accent, variant = 'body' }: RichContentProps) {
  if (!children?.trim()) return null;

  const baseStyle: TextStyle = {
    color: colors.textMuted,
    fontSize: variant === 'title' ? font.size.xxl : variant === 'caption' ? font.size.sm : font.size.lg,
    lineHeight: variant === 'title' ? 36 : variant === 'caption' ? 20 : 28,
    fontWeight: variant === 'title' ? '800' : '400',
    ...style,
  };

  const blocks = parseMarkdownBlocks(children);
  const hasStructure = blocks.length > 1 || blocks[0]?.type !== 'paragraph';

  if (!hasStructure) {
    const onlyMath = splitMathSegments(children);
    if (onlyMath.length === 1 && onlyMath[0].type === 'math') {
      return (
        <MathTokens latex={onlyMath[0].content} block={onlyMath[0].block} baseStyle={baseStyle} accent={accent} />
      );
    }
    return <InlineRich text={children} baseStyle={baseStyle} accent={accent} />;
  }

  return (
    <View style={styles.wrap}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} baseStyle={baseStyle} accent={accent} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  list: { gap: spacing.xs },
  listRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bullet: { width: 18, color: colors.textFaint },
  listItem: { flex: 1 },
  codeBlock: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  codeText: {
    color: colors.success,
    fontFamily: 'Menlo',
    fontSize: font.size.sm,
    lineHeight: 20,
  },
  quoteBlock: {
    borderLeftWidth: 4,
    borderLeftColor: colors.border,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
  },
  mathBlockWrap: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    marginVertical: spacing.xs,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
  },
  mathBlock: { fontSize: font.size.lg },
  fracNum: { fontSize: font.size.sm, textAlign: 'center' },
  fracBar: { fontSize: 10, color: colors.textFaint },
  fracDen: { fontSize: font.size.sm, textAlign: 'center' },
  sup: { fontSize: font.size.xs, lineHeight: 14 },
  sub: { fontSize: font.size.xs, lineHeight: 14 },
});

export { parseInlineSegments };
export type { InlineSegment };
