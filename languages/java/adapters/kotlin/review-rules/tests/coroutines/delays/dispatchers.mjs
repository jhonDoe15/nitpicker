import { marksFrom } from '../../discovery/text-scan.mjs';

const REAL_DISPATCHER = new RegExp(
  [
    String.raw`\bDispatchers\s*\.\s*(?:Default|IO|Unconfined)\b`,
    String.raw`\b(?:newSingleThreadContext|newFixedThreadPoolContext)\s*\(`,
    String.raw`\.\s*asCoroutineDispatcher\s*\(`,
  ].join('|'),
  'u',
);
const MAIN_DISPATCHER = /\bDispatchers\s*\.\s*Main\b/u;
const TEST_DISPATCHER =
  /Test(?:Dispatcher|CoroutineScheduler|Scope)\b|\btestScheduler\b|\btestDispatcher\b/u;
const NEUTRAL_ELEMENT = new RegExp(
  [
    String.raw`^(?:NonCancellable|EmptyCoroutineContext|CoroutineName\s*\([^)]*\)`,
    String.raw`(?:Supervisor)?Job\s*\([^)]*\)|CoroutineExceptionHandler\b.*)$`,
  ].join('|'),
  'u',
);
const IDENTIFIER_ONLY = /^\s*(?:this\s*\.\s*)?([A-Za-z_]\w*)\s*$/u;
const DECLARATION = /\b(?:val|var)\s+([A-Za-z_]\w*)\s*(?::\s*([\w.<>?]+))?\s*(?:=\s*([^\n]*))?/gu;
const PARAMETER_DEFAULT = /[(,]\s*([A-Za-z_]\w*)\s*:\s*[\w.<>?]+\s*=\s*([^,)\n]+)/gu;
const ASSIGNMENT = /^[ \t]*(?:this\s*\.\s*)?([A-Za-z_]\w*)\s*=(?!=)\s*([^\n]+)/gmu;
const KNOWN = new Set(['real', 'virtual']);

function bind(bindings, name, entry) {
  bindings.set(name, [...(bindings.get(name) ?? []), entry]);
}

export function contextDeclarations(code) {
  const bindings = new Map();
  for (const match of code.matchAll(DECLARATION)) {
    const typeOnly = match[3] === undefined;
    bind(bindings, match[1], { text: typeOnly ? (match[2] ?? '') : match[3], typeOnly });
  }
  for (const match of [...code.matchAll(PARAMETER_DEFAULT), ...code.matchAll(ASSIGNMENT)]) {
    bind(bindings, match[1], { text: match[2], typeOnly: false });
  }
  return bindings;
}

function classifyElement(text, project) {
  const main = MAIN_DISPATCHER.test(text);
  const real = REAL_DISPATCHER.test(text) || (main && !project.mainReplaced);
  const virtual = TEST_DISPATCHER.test(text) || (main && project.mainReplaced);
  if (real && virtual) {
    return 'unknown';
  }
  if (real || virtual) {
    return real ? 'real' : 'virtual';
  }
  return NEUTRAL_ELEMENT.test(text.trim()) ? 'inherit' : undefined;
}

function resolveIdentifier(text, declarations, project) {
  const name = IDENTIFIER_ONLY.exec(text)?.[1];
  const entries = name === undefined ? [] : (declarations.get(name) ?? []);
  const kinds = entries.map((entry) => ({ ...entry, kind: classifyElement(entry.text, project) }));
  const poisoned = kinds.some(({ kind, typeOnly }) => !typeOnly && !KNOWN.has(kind));
  const known = new Set(kinds.filter(({ kind }) => KNOWN.has(kind)).map(({ kind }) => kind));
  return !poisoned && known.size === 1 ? [...known][0] : 'unknown';
}

function contextElements(text) {
  const parts = [];
  const state = { depth: 0, start: 0 };
  for (const { index, 0: mark } of marksFrom(text, /[()[\]{}+]/gu, 0)) {
    state.depth += '([{'.includes(mark) ? 1 : 0;
    state.depth -= ')]}'.includes(mark) ? 1 : 0;
    if (mark === '+' && state.depth === 0) {
      parts.push(text.slice(state.start, index));
      state.start = index + 1;
    }
  }
  return [...parts, text.slice(state.start)].filter((part) => part.trim() !== '');
}

export function classifyContext(text, declarations, project) {
  const kinds = contextElements(text).map(
    (element) =>
      classifyElement(element, project) ?? resolveIdentifier(element, declarations, project),
  );
  return kinds.toReversed().find((kind) => kind !== 'inherit') ?? 'inherit';
}
