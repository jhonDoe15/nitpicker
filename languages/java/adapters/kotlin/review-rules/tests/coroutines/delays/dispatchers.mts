import { groupOf } from '../../typed/indexing.mts';
import type { Binding, Bindings, DispatchKind } from '../../typed/rule-types.mts';
import { marksFrom } from '../../discovery/text-scan.mts';

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
const UNKNOWN = 'unknown';
const INHERIT = 'inherit';
const KNOWN = new Set<DispatchKind | undefined>(['real', 'virtual']);

function bind(bindings: Bindings, name: string, entry: Binding): void {
  bindings.set(name, [...(bindings.get(name) ?? []), entry]);
}

export function contextDeclarations(code: string): Bindings {
  const bindings: Bindings = new Map();
  for (const match of code.matchAll(DECLARATION)) {
    const typeOnly = match[3] === undefined;
    bind(bindings, groupOf(match, 1), {
      text: typeOnly ? (match[2] ?? '') : (match[3] ?? ''),
      typeOnly,
    });
  }
  for (const match of [...code.matchAll(PARAMETER_DEFAULT), ...code.matchAll(ASSIGNMENT)]) {
    bind(bindings, groupOf(match, 1), { text: groupOf(match, 2), typeOnly: false });
  }
  return bindings;
}

function classifyElement(
  text: string,
  project: { mainReplaced: boolean },
): DispatchKind | undefined {
  const main = MAIN_DISPATCHER.test(text);
  const real = REAL_DISPATCHER.test(text) || (main && !project.mainReplaced);
  const virtual = TEST_DISPATCHER.test(text) || (main && project.mainReplaced);
  if (real && virtual) {
    return UNKNOWN;
  }
  if (real || virtual) {
    return real ? 'real' : 'virtual';
  }
  return NEUTRAL_ELEMENT.test(text.trim()) ? INHERIT : undefined;
}

function resolveIdentifier(
  text: string,
  declarations: Bindings,
  project: { mainReplaced: boolean },
): DispatchKind {
  const name = IDENTIFIER_ONLY.exec(text)?.[1];
  const entries = name === undefined ? [] : (declarations.get(name) ?? []);
  const kinds = entries.map((entry) => ({ ...entry, kind: classifyElement(entry.text, project) }));
  const poisoned = kinds.some(({ kind, typeOnly }) => !(typeOnly || KNOWN.has(kind)));
  const known = new Set(kinds.filter(({ kind }) => KNOWN.has(kind)).map(({ kind }) => kind));
  const [only] = [...known];
  return !poisoned && known.size === 1 ? (only ?? UNKNOWN) : UNKNOWN;
}

function contextElements(text: string): string[] {
  const parts: string[] = [];
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

export function classifyContext(
  text: string,
  declarations: Bindings,
  project: { mainReplaced: boolean },
): DispatchKind {
  const kinds = contextElements(text).map(
    (element) =>
      classifyElement(element, project) ?? resolveIdentifier(element, declarations, project),
  );
  return kinds.toReversed().find((kind) => kind !== INHERIT) ?? INHERIT;
}
