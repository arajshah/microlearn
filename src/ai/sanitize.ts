/**
 * Strip model reasoning wrappers and clean chat text for display.
 * Shared by lesson JSON extraction and tutor replies.
 */

export function stripReasoningWrappers(s: string): string {
  let out = s.trim();

  for (const tag of ['thought', 'reasoning', 'analysis']) {
    const close = new RegExp(`</${tag}>`, 'gi');
    let lastEnd = -1;
    let m: RegExpExecArray | null;
    while ((m = close.exec(out)) !== null) {
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd !== -1) {
      out = out.slice(lastEnd).trim();
      break;
    }
  }

  out = out.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
  out = out.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  out = out.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');

  const unclosed = out.match(
    /^<(?:thought|reasoning|analysis)>[\s\S]*?(?=\S)/i,
  );
  if (unclosed && !out.match(/^\s*\{/)) {
    out = out.replace(/^<(?:thought|reasoning|analysis)>[\s\S]*/i, '').trim();
  }

  return out.trim();
}
