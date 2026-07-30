import { LessonDiagram, DiagramKind, DiagramNode, DiagramEdge } from '@/types/diagram';

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
}

function parseKind(v: unknown): DiagramKind | undefined {
  const kinds: DiagramKind[] = ['flow', 'split', 'timeline', 'hierarchy', 'io', 'ascii'];
  return typeof v === 'string' && kinds.includes(v as DiagramKind) ? (v as DiagramKind) : undefined;
}

/** Parse structured diagram JSON from AI output or card field. */
export function parseDiagramJson(raw: unknown): LessonDiagram | null {
  if (raw == null) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{')) return null;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const record = obj as Record<string, unknown>;
  const kind = parseKind(record.kind);
  if (!kind) return null;

  const nodes: DiagramNode[] = Array.isArray(record.nodes)
    ? record.nodes
        .map((n, i) => {
          if (typeof n !== 'object' || n === null) return null;
          const r = n as Record<string, unknown>;
          const label = asString(r.label);
          if (!label) return null;
          return { id: asString(r.id) ?? `n${i + 1}`, label };
        })
        .filter((n): n is DiagramNode => n != null)
    : [];

  const edges: DiagramEdge[] = Array.isArray(record.edges)
    ? record.edges
        .map((e): DiagramEdge | null => {
          if (typeof e !== 'object' || e === null) return null;
          const r = e as Record<string, unknown>;
          const from = asString(r.from);
          const to = asString(r.to);
          if (!from || !to) return null;
          const edge: DiagramEdge = { from, to };
          const label = asString(r.label);
          if (label) edge.label = label;
          return edge;
        })
        .filter((e): e is DiagramEdge => e != null)
    : [];

  return {
    kind,
    nodes: nodes.length > 0 ? nodes : undefined,
    edges: edges.length > 0 ? edges : undefined,
    leftTitle: asString(record.leftTitle),
    leftItems: asStringArray(record.leftItems),
    rightTitle: asString(record.rightTitle),
    rightItems: asStringArray(record.rightItems),
    steps: asStringArray(record.steps),
    inputLabel: asString(record.inputLabel),
    outputLabel: asString(record.outputLabel),
    ascii: asString(record.ascii),
  };
}

const PROSE_RE =
  /^(a |an |the )?(simple |split[- ]screen |side[- ]by[- ]side )?(diagram|flowchart|visual|model|illustration)/i;

function extractSplitItems(desc: string): { left: string[]; right: string[]; leftTitle?: string; rightTitle?: string } | null {
  const leftMatch = desc.match(/left(?:\s+side)?(?:\s+shows?|\s+has)?\s+([^.;]+)/i);
  const rightMatch = desc.match(/right(?:\s+side)?(?:\s+shows?|\s+has)?\s+([^.;]+)/i);
  if (!leftMatch && !rightMatch) return null;
  const split = (s: string) =>
    s.split(/,| and | versus | vs\.? /i).map((x) => x.trim()).filter(Boolean);
  return {
    leftTitle: 'Left',
    rightTitle: 'Right',
    left: leftMatch ? split(leftMatch[1]) : ['Prior idea'],
    right: rightMatch ? split(rightMatch[1]) : ['New idea'],
  };
}

function extractFlowNodes(desc: string): DiagramNode[] {
  const cleaned = desc
    .replace(PROSE_RE, '')
    .replace(/shows?|illustrates?|depicts?/gi, '')
    .trim();

  const arrowParts = cleaned.split(/\s*(?:→|->|=>|then|flows? into|leads? to)\s*/i).filter(Boolean);
  if (arrowParts.length >= 2) {
    return arrowParts.map((label, i) => ({ id: `n${i + 1}`, label: label.trim().replace(/[."]$/g, '') }));
  }

  const sentences = cleaned.split(/[.;]/).map((s) => s.trim()).filter((s) => s.length > 3 && !PROSE_RE.test(s));
  if (sentences.length >= 2) {
    return sentences.slice(0, 5).map((label, i) => ({ id: `n${i + 1}`, label }));
  }

  return [
    { id: 'n1', label: 'Input' },
    { id: 'n2', label: cleaned.slice(0, 60) || 'Process' },
    { id: 'n3', label: 'Output' },
  ];
}

function flowEdges(nodes: DiagramNode[]): DiagramEdge[] {
  const edges: DiagramEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
  }
  return edges;
}

function buildAsciiFlow(nodes: DiagramNode[]): string {
  const labels = nodes.map((n) => n.label);
  const box = (text: string) => {
    const inner = text.length > 28 ? `${text.slice(0, 25)}...` : text;
    const line = `│ ${inner.padEnd(28)} │`;
    const top = `┌${'─'.repeat(30)}┐`;
    const bot = `└${'─'.repeat(30)}┘`;
    return `${top}\n${line}\n${bot}`;
  };
  return labels.map((l, i) => (i < labels.length - 1 ? `${box(l)}\n       ↓\n` : box(l))).join('');
}

function buildAsciiSplit(left: string[], right: string[], leftTitle: string, rightTitle: string): string {
  const col = (title: string, items: string[]) => {
    const lines = [title, ...items.map((x) => `• ${x}`)];
    const width = Math.max(...lines.map((l) => l.length), 12);
    return lines.map((l) => `│ ${l.padEnd(width)} │`).join('\n');
  };
  const w = 16;
  return [
    `┌${'─'.repeat(w)}┐   ┌${'─'.repeat(w)}┐`,
    col(leftTitle, left).split('\n').map((l, i) => (i === 0 ? l : `│ ${l.slice(2)}`)).join('\n'),
  ].join('\n');
}

/** Turn prose visualDescription into a renderable diagram when possible. */
export function diagramFromDescription(description: string): LessonDiagram | null {
  const desc = description?.trim();
  if (!desc) return null;

  const json = parseDiagramJson(desc);
  if (json) return json;

  const lower = desc.toLowerCase();
  if (lower.includes('split') || lower.includes('left side') || lower.includes('right side')) {
    const split = extractSplitItems(desc);
    if (split) {
      return {
        kind: 'split',
        leftTitle: split.leftTitle,
        leftItems: split.left,
        rightTitle: split.rightTitle,
        rightItems: split.right,
        ascii: buildAsciiSplit(split.left, split.right, split.leftTitle ?? 'Left', split.rightTitle ?? 'Right'),
      };
    }
  }

  if (lower.includes('timeline') || lower.includes('step 1') || /first.+then/i.test(desc)) {
    const steps = desc
      .split(/(?:,| then | finally | next |\. )/i)
      .map((s) => s.trim().replace(PROSE_RE, ''))
      .filter((s) => s.length > 4)
      .slice(0, 6);
    if (steps.length >= 2) {
      return { kind: 'timeline', steps };
    }
  }

  if (lower.includes('tree') || lower.includes('hierarchy') || lower.includes('branches')) {
    const nodes = extractFlowNodes(desc);
    return { kind: 'hierarchy', nodes, edges: flowEdges(nodes) };
  }

  // An explicitly named "flow" wins over generic input/output phrasing.
  if (lower.includes('input') && lower.includes('output') && !lower.includes('flow')) {
    const parts = desc.split(/output/i);
    return {
      kind: 'io',
      inputLabel: parts[0]?.replace(/input/gi, '').trim().slice(0, 40) || 'Input',
      outputLabel: parts[1]?.trim().slice(0, 40) || 'Output',
      nodes: extractFlowNodes(desc),
      edges: flowEdges(extractFlowNodes(desc)),
    };
  }

  if (PROSE_RE.test(desc) || lower.includes('diagram') || lower.includes('flow') || lower.includes('arrow')) {
    const nodes = extractFlowNodes(desc);
    return {
      kind: 'flow',
      nodes,
      edges: flowEdges(nodes),
      ascii: buildAsciiFlow(nodes),
    };
  }

  return null;
}

/** Resolve diagram from explicit field or visualDescription prose. */
export function resolveLessonDiagram(
  diagram: unknown,
  visualDescription: string,
): LessonDiagram | null {
  return parseDiagramJson(diagram) ?? diagramFromDescription(visualDescription);
}
