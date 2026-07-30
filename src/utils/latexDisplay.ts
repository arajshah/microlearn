/** Lightweight LaTeX → readable display tokens for React Native Text. */

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ',
  phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Sigma: 'Σ', Phi: 'Φ', Omega: 'Ω',
};

const SYMBOLS: Record<string, string> = {
  times: '×', cdot: '·', pm: '±', mp: '∓', leq: '≤', geq: '≥', neq: '≠',
  approx: '≈', equiv: '≡', infty: '∞', partial: '∂', nabla: '∇',
  sum: '∑', prod: '∏', int: '∫', sqrt: '√',ldots: '…', cdots: '⋯',
  rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐',
  forall: '∀', exists: '∃', in: '∈', notin: '∉', subset: '⊂', supset: '⊃',
  cap: '∩', cup: '∪', otimes: '⊗',oplus: '⊕',
};

export type DisplayToken =
  | { kind: 'text'; value: string }
  | { kind: 'sup'; value: string }
  | { kind: 'sub'; value: string }
  | { kind: 'frac'; num: string; den: string };

function stripDelimiters(latex: string): string {
  return latex.replace(/^\$+|\$+$/g, '').replace(/^\\\(|\\\)$/g, '').replace(/^\\\[|\\\]$/g, '').trim();
}

function replaceSymbols(s: string): string {
  let out = s;
  out = out.replace(/\\([a-zA-Z]+)/g, (_, cmd: string) => GREEK[cmd] ?? SYMBOLS[cmd] ?? cmd);
  out = out.replace(/\\,/g, ' ');
  out = out.replace(/\\;/g, ' ');
  out = out.replace(/\\quad/g, '  ');
  out = out.replace(/\\qquad/g, '    ');
  out = out.replace(/\\left/g, '').replace(/\\right/g, '');
  out = out.replace(/\\text\{([^}]*)\}/g, '$1');
  out = out.replace(/\\mathrm\{([^}]*)\}/g, '$1');
  out = out.replace(/\\mathbf\{([^}]*)\}/g, '$1');
  out = out.replace(/\\overline\{([^}]*)\}/g, '$1̄');
  out = out.replace(/\\hat\{([^}]*)\}/g, '$1̂');
  out = out.replace(/\\bar\{([^}]*)\}/g, '$1̄');
  out = out.replace(/\\sqrt\{([^}]*)\}/g, '√($1)');
  out = out.replace(/\{/g, '').replace(/\}/g, '');
  out = out.replace(/\\\\/g, ' ');
  return out;
}

/** Parse a LaTeX fragment into display tokens. */
export function latexToTokens(latex: string): DisplayToken[] {
  const cleaned = replaceSymbols(stripDelimiters(latex));
  const tokens: DisplayToken[] = [];
  let i = 0;

  while (i < cleaned.length) {
    const fracMatch = cleaned.slice(i).match(/^\\frac\{([^}]*)\}\{([^}]*)\}/);
    if (fracMatch) {
      tokens.push({ kind: 'frac', num: fracMatch[1], den: fracMatch[2] });
      i += fracMatch[0].length;
      continue;
    }

    const inlineFrac = cleaned.slice(i).match(/^([^{}^_]+)\/([^{}^_\s]+)/);
    if (inlineFrac && tokens.length > 0) {
      const prev = tokens[tokens.length - 1];
      if (prev.kind === 'text' && prev.value.trim().length <= 3) {
        tokens.pop();
        tokens.push({ kind: 'frac', num: prev.value.trim() || inlineFrac[1], den: inlineFrac[2] });
        i += inlineFrac[0].length;
        continue;
      }
    }

    if (cleaned[i] === '^') {
      const brace = cleaned[i + 1] === '{';
      const sup = brace
        ? cleaned.slice(i + 2, cleaned.indexOf('}', i + 2))
        : cleaned[i + 1] ?? '';
      if (sup) tokens.push({ kind: 'sup', value: sup });
      i += brace ? sup.length + 3 : 2;
      continue;
    }

    if (cleaned[i] === '_') {
      const brace = cleaned[i + 1] === '{';
      const sub = brace
        ? cleaned.slice(i + 2, cleaned.indexOf('}', i + 2))
        : cleaned[i + 1] ?? '';
      if (sub) tokens.push({ kind: 'sub', value: sub });
      i += brace ? sub.length + 3 : 2;
      continue;
    }

    let j = i + 1;
    while (j < cleaned.length && !'^_{}'.includes(cleaned[j])) j++;
    const chunk = cleaned.slice(i, j);
    if (chunk) {
      const last = tokens[tokens.length - 1];
      if (last?.kind === 'text') last.value += chunk;
      else tokens.push({ kind: 'text', value: chunk });
    }
    i = j;
  }

  return tokens.length > 0 ? tokens : [{ kind: 'text', value: cleaned }];
}

/** Plain-text fallback for speech / accessibility. */
export function latexToPlainText(latex: string): string {
  return latexToTokens(latex)
    .map((t) => {
      if (t.kind === 'frac') return `(${t.num})/(${t.den})`;
      if (t.kind === 'sup') return `^${t.value}`;
      if (t.kind === 'sub') return `_${t.value}`;
      return t.value;
    })
    .join('');
}
