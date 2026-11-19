import { between } from '../max-value-sums/source/source-file.mts';
import { declaredIn, enclosingOpeners, walkWhile } from './declarations.mts';
import type { Frame, SourceFile, Span } from '../max-value-sums/sum-types.mts';
import type { MethodInfo, Nullable } from './declarations.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';

const RETURN = 'return';
const NULL_INIT_TOKENS = 4;
const NULL_INIT_END = 3;
const STUB_TOKENS = 3;
const EXIT_SPAN = 8;
const NULLABLE_ANNOTATIONS = /^(?:CheckForNull|NonNull\w*|NotNull|Nonnull|Null\w*)$/u;
const SKIPPED_RETURNS =
  /^(?:void|boolean|byte|short|int|long|char|float|double|Boolean|Optional\w*)(?:<.*>)?$/u;

function typeToken(token: Token | undefined): boolean {
  return token?.kind === 'identifier' || '.<>,?'.includes(token?.text ?? '#');
}

export function newBefore(tokens: readonly Token[], paren: number): boolean {
  const at = walkWhile(paren - 1, -1, (step) => step >= 0 && typeToken(tokens[step]));
  return tokens[at]?.text === 'new' && at < paren - 1;
}

function directlyIn(source: SourceFile, index: number, bodyOpen: number): boolean {
  const { tokens, opener, partner } = source;
  const chain = enclosingOpeners(opener, index);
  const stop = chain.indexOf(bodyOpen);
  return !(stop < 0 ? chain : chain.slice(0, stop)).some((open) => {
    const lambda = tokens[open - 1]?.text === '->';
    const anonymous = tokens[open - 1]?.text === ')' && newBefore(tokens, partner[open - 1] ?? 0);
    return tokens[open]?.text === '{' && (lambda || anonymous);
  });
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
  if (frame.body.to - frame.body.from <= STUB_TOKENS) {
    return undefined;
  }
  const found = between(frame.body.from, frame.body.to).find(
    (index) =>
      tokens[index]?.text === RETURN &&
      tokens[index + 1]?.text === 'null' &&
      tokens[index + 2]?.text === ';' &&
      directlyIn(source, index, frame.body.from - 1) &&
      !guardsParameter(source, frame, index) &&
      !afterExit(tokens, index),
  );
  return found === undefined ? undefined : tokens[found]?.line;
}

function statementBounds(source: SourceFile, assignment: number, bodyOpen: number): Span {
  const { tokens, opener, partner } = source;
  if (opener[assignment] === bodyOpen) {
    const end = tokens.findIndex((token, at) => at > assignment && token.text === ';');
    return { from: assignment, to: end };
  }
  const open = enclosingOpeners(opener, assignment).find((at) => opener[at] === bodyOpen) ?? -1;
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
    tokens[index + NULL_INIT_END]?.text === ';' &&
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
    const found = assignedOnSomePaths(source, frame, { name, from: index + NULL_INIT_TOKENS });
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

type Local = { readonly name: string; readonly from: number };

function nextText(tokens: readonly Token[], index: number): string {
  return tokens[index + 1]?.text ?? '';
}

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
  const returns = own.filter(
    (index) =>
      tokens[index - 1]?.text === RETURN &&
      nextText(tokens, index) === ';' &&
      opener[index] === bodyOpen,
  );
  return {
    assignments: own.filter((index) => nextText(tokens, index) === '='),
    compared: own.some(
      (index) =>
        ['==', '!='].includes(nextText(tokens, index)) && tokens[index + 2]?.text === 'null',
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
      index === method.frame.open && type === 'boolean' && tag.split(/\W+/u).includes(name),
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
    return { why: RETURN, line: direct };
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
