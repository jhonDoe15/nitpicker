import { between } from '../max-value-sums/source-file.mts';
import { declaredIn } from './declarations.mts';
import type { Frame, SourceFile, Span } from '../max-value-sums/sum-types.mts';
import type { MethodInfo, Nullable } from './declarations.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';

const DOCUMENTED =
  /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*(?:@\w+(?:\([^)]*\))?\s*)*[\w.<>[\],?\s]+?\s+(\w+)\s*\(/dgu;
const RETURN_TAG = /@return\b([\s\S]*?)(?=\n\s*\*?\s*@\w|$)/u;
const NEGATIONS = [
  'never',
  'always',
  'not',
  'non',
  'neither',
  'nor',
  'no',
  'without',
  'instead of',
  'rather than',
  'cannot',
  "can't",
  'default implementation',
];
const NEGATED = new RegExp(String.raw`\b(?:${NEGATIONS.join('|')})\b[^.;]{0,24}\bnull`, 'iu');
const NULL_IN_NULL_OUT =
  /\bnull\s+(?:if|when|for)\s+(?:the\s+)?[\w\s]{0,24}?\b(?:is|are|was)\s+(?:\{@code\s+|<code>)?null\b/iu;
const MAY_BE_NULL = new RegExp(
  [
    String.raw`\bnull\s+(?:if|when|otherwise|unless|in case|on|for|where|as)\b`,
    String.raw`\bor\s+(?:\{@code\s+|<code>)?null\b`,
    String.raw`\b(?:may|can|might|will|could)\s+(?:also\s+)?(?:be|return)\s+(?:\{@code\s+|<code>)?null\b`,
    String.raw`^\s*(?:\{@code\s+|<code>)?null\b`,
    String.raw`\bnull\s+(?:is returned|means)\b`,
  ].join('|'),
  'iu',
);
const STUB_TOKENS = 3;
const EXIT_SPAN = 8;
const NULLABLE_ANNOTATIONS = /^(?:Nullable\w*|CheckForNull|NonNull\w*|NotNull|Nonnull|Null\w*)$/u;
const SKIPPED_RETURNS =
  /^(?:void|boolean|byte|short|int|long|char|float|double|Boolean|Optional\w*)(?:<.*>)?$/u;

export function documentedNullable(text: string): Map<string, string> {
  const found = new Map<string, string>();
  let line = 1;
  let offset = 0;
  for (const match of text.matchAll(DOCUMENTED)) {
    const nameAt = match.indices?.[2]?.[0] ?? offset;
    line += text.slice(offset, nameAt).split('\n').length - 1;
    offset = nameAt;
    const comment = (match[1] ?? '').replaceAll(/\n\s*\*/gu, '\n');
    const tag = (RETURN_TAG.exec(comment)?.[1] ?? '').replaceAll(/\s+/gu, ' ');
    if (!NEGATED.test(tag) && !NULL_IN_NULL_OUT.test(tag) && MAY_BE_NULL.test(tag)) {
      found.set(`${match[2] ?? ''}:${String(line)}`, tag);
    }
  }
  return found;
}

export function newBefore(tokens: readonly Token[], paren: number): boolean {
  let at = paren - 1;
  while (
    at >= 0 &&
    (tokens[at]?.kind === 'identifier' || '.<>,?'.includes(tokens[at]?.text ?? '#'))
  ) {
    at -= 1;
  }
  return tokens[at]?.text === 'new' && at < paren - 1;
}

function directlyIn(source: SourceFile, index: number, bodyOpen: number): boolean {
  const { tokens, opener, partner } = source;
  let open = opener[index] ?? -1;
  while (open >= 0 && open !== bodyOpen) {
    const lambda = tokens[open - 1]?.text === '->';
    const anonymous = tokens[open - 1]?.text === ')' && newBefore(tokens, partner[open - 1] ?? 0);
    if (tokens[open]?.text === '{' && (lambda || anonymous)) {
      return false;
    }
    open = opener[open] ?? -1;
  }
  return true;
}

function guardsParameter(source: SourceFile, frame: Frame, at: number): boolean {
  const { tokens, partner } = source;
  const block = source.opener[at] ?? -1;
  const bare = tokens[at - 1]?.text === ')' && tokens[(partner[at - 1] ?? 0) - 1]?.text === 'if';
  const close = tokens[block]?.text === '{' && !bare ? block - 1 : at - 1;
  const open = partner[close] ?? -1;
  const names = new Set(frame.params.map(({ name }) => name));
  const condition = tokens.slice(open + 1, close).map(({ text }) => text);
  const nullParameter = condition.some(
    (text, index) =>
      names.has(text) && condition[index + 1] === '==' && condition[index + 2] === 'null',
  );
  return (
    tokens[close]?.text === ')' &&
    tokens[open - 1]?.text === 'if' &&
    nullParameter &&
    !condition.includes('&&')
  );
}

function afterExit(tokens: readonly Token[], at: number): boolean {
  return (
    tokens[at - 1]?.text === ';' &&
    tokens[at - 2]?.text === ')' &&
    tokens
      .slice(Math.max(0, at - EXIT_SPAN), at)
      .some((token, index, span) => token.text === 'exit' && span[index - 1]?.text === '.')
  );
}

function returnsNull(source: SourceFile, frame: Frame): number | undefined {
  const { tokens } = source;
  const stub = frame.body.to - frame.body.from <= STUB_TOKENS;
  for (let index = frame.body.from; index < frame.body.to && !stub; index += 1) {
    const isReturn = tokens[index]?.text === 'return' && tokens[index + 1]?.text === 'null';
    const direct = isReturn && tokens[index + 2]?.text === ';';
    if (
      direct &&
      directlyIn(source, index, frame.body.from - 1) &&
      !guardsParameter(source, frame, index) &&
      !afterExit(tokens, index)
    ) {
      return tokens[index]?.line;
    }
  }
  return undefined;
}

function statementBounds(source: SourceFile, assignment: number, bodyOpen: number): Span {
  const { tokens, opener, partner } = source;
  let open = opener[assignment] ?? -1;
  if (open === bodyOpen) {
    const end = tokens.findIndex((token, at) => at > assignment && token.text === ';');
    return { from: assignment, to: end };
  }
  while (open >= 0 && opener[open] !== bodyOpen) {
    open = opener[open] ?? -1;
  }
  return { from: open, to: partner[open] ?? -1 };
}

function onlyOnSomePath(source: SourceFile, assignment: number, bodyOpen: number): boolean {
  const { tokens, partner } = source;
  const { from, to } = statementBounds(source, assignment, bodyOpen);
  const keyword = (partner[from - 1] ?? -1) - 1;
  return (
    tokens[from - 1]?.text === ')' &&
    tokens[keyword]?.text === 'if' &&
    tokens[keyword - 1]?.text !== 'else' &&
    tokens[to + 1]?.text !== 'else'
  );
}

function isNullInit(source: SourceFile, bodyOpen: number, index: number): boolean {
  const { tokens, opener } = source;
  const before = tokens[index - 1];
  return (
    opener[index] === bodyOpen &&
    tokens[index]?.kind === 'identifier' &&
    tokens[index + 1]?.text === '=' &&
    tokens[index + 2]?.text === 'null' &&
    tokens[index + 3]?.text === ';' &&
    (before?.kind === 'identifier' || before?.text === '>')
  );
}

function localReturnLine(source: SourceFile, frame: Frame): number | undefined {
  const bodyOpen = frame.body.from - 1;
  const inits = between(frame.body.from, frame.body.to).filter((index) =>
    isNullInit(source, bodyOpen, index),
  );
  for (const index of inits) {
    const name = source.tokens[index]?.text ?? '';
    const found = assignedOnSomePaths(source, frame, { name, from: index + 4 });
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

type Local = { readonly name: string; readonly from: number };

function mentionsOf(
  source: SourceFile,
  frame: Frame,
  { name, from }: Local,
): { assignments: number[]; returned: number | undefined; compared: boolean } {
  const { tokens, opener } = source;
  const bodyOpen = frame.body.from - 1;
  const own = between(from, frame.body.to).filter(
    (index) => tokens[index]?.text === name && tokens[index - 1]?.text !== '.',
  );
  const next = (index: number): string => tokens[index + 1]?.text ?? '';
  const returns = own.filter(
    (index) =>
      tokens[index - 1]?.text === 'return' && next(index) === ';' && opener[index] === bodyOpen,
  );
  return {
    assignments: own.filter((index) => next(index) === '='),
    compared: own.some(
      (index) => ['==', '!='].includes(next(index)) && tokens[index + 2]?.text === 'null',
    ),
    returned: tokens[returns.at(-1) ?? -1]?.line,
  };
}

function assignedOnSomePaths(source: SourceFile, frame: Frame, local: Local): number | undefined {
  const { assignments, returned, compared } = mentionsOf(source, frame, local);
  const bodyOpen = frame.body.from - 1;
  const conditional = assignments.every((index) => onlyOnSomePath(source, index, bodyOpen));
  return !compared && assignments.length > 0 && conditional ? returned : undefined;
}

function dependsOnFlag(source: SourceFile, method: MethodInfo, tag: string): boolean {
  return declaredIn(source, method.frame).some(
    ({ name, type, index }) =>
      index === method.frame.open &&
      type === 'boolean' &&
      new RegExp(`\\b${name}\\b`, 'u').test(tag),
  );
}

export function eligible(method: MethodInfo): boolean {
  return !(
    method.varargs ||
    SKIPPED_RETURNS.test(method.returnType) ||
    method.annotations.some((name) => NULLABLE_ANNOTATIONS.test(name))
  );
}

export function nullableOf(
  source: SourceFile,
  method: MethodInfo,
  documented: ReadonlyMap<string, string>,
): Nullable | undefined {
  if (!eligible(method)) {
    return undefined;
  }
  const direct = returnsNull(source, method.frame);
  if (direct !== undefined) {
    return { why: 'return', line: direct };
  }
  const local = localReturnLine(source, method.frame);
  if (local !== undefined) {
    return { why: 'local', line: local };
  }
  const nameLine = source.tokens[method.frame.open - 1]?.line ?? 0;
  const tag = documented.get(`${method.name}:${String(nameLine)}`);
  return tag !== undefined && !dependsOnFlag(source, method, tag)
    ? { why: 'javadoc', line: nameLine }
    : undefined;
}
