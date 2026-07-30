export type DiagramKind = 'flow' | 'split' | 'timeline' | 'hierarchy' | 'io' | 'ascii';

export interface DiagramNode {
  id: string;
  label: string;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

/** Structured diagram spec for visual_model cards. */
export interface LessonDiagram {
  kind: DiagramKind;
  nodes?: DiagramNode[];
  edges?: DiagramEdge[];
  leftTitle?: string;
  leftItems?: string[];
  rightTitle?: string;
  rightItems?: string[];
  steps?: string[];
  inputLabel?: string;
  outputLabel?: string;
  ascii?: string;
}
