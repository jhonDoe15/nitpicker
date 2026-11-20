import { declarations, eachFrame, ownUses, textsOf } from '../scan.mts';
import type { Declaration, ValueCheck, ValueFound } from '../scan.mts';
import type { Frame, SourceFile, Span } from '../../max-value-sums/sum-types.mts';
import type { Token } from '../../../reuse/jvm-reuse-types.mts';

const NAN_GUARD_RULE = 'NanOnlyGuard';

const STATIC_PARSERS = new Set(['parseDouble', 'parseFloat', 'valueOf']);
const RECEIVER_PARSERS = new Set(['toDoubleOrNull', 'toFloatOrNull']);
const OWNERS = new Set(['Double', 'Float']);
const FINITE = new Set([
  'isFinite',
  'isInfinite',
  'POSITIVE_INFINITY',
  'NEGATIVE_INFINITY',
  'Infinity',
]);
const RELATIONS = new Set(['<', '>', '<=', '>=']);

type NanCall = { readonly index: number; readonly name: string; readonly line: number };

function isParsed(source: SourceFile, { at, end }: Declaration): boolean {
  const texts = textsOf(source, at + 2, end);
  return texts.some((text, index) => {
    const call = texts[index + 1] === '(';
    const owned = OWNERS.has(texts[index - 2] ?? '') && texts[index - 1] === '.';
    return (
      call &&
      ((STATIC_PARSERS.has(text) && owned) ||
        (RECEIVER_PARSERS.has(text) && texts[index - 1] === '.'))
    );
  });
}

function nanCallAt(tokens: readonly Token[], index: number): NanCall | undefined {
  const token = tokens[index];
  if (token === undefined || token.text !== 'isNaN') {
    return undefined;
  }
  const { line } = token;
  const staticForm = OWNERS.has(tokens[index - 2]?.text ?? '') && tokens[index - 1]?.text === '.';
  const argument = tokens[index + 2];
  if (staticForm && tokens[index + 1]?.text === '(' && argument?.kind === 'identifier') {
    return { index, name: argument.text, line };
  }
  const receiver = tokens[index - 2];
  const dotted = tokens[index - 1]?.text === '.' && receiver?.kind === 'identifier';
  return dotted ? { index, name: receiver.text, line } : undefined;
}

function nanCalls(source: SourceFile, { from, to }: Span): NanCall[] {
  const calls: NanCall[] = [];
  for (const index of source.tokens.slice(from, to).keys()) {
    const call = nanCallAt(source.tokens, from + index);
    if (call !== undefined) {
      calls.push(call);
    }
  }
  return calls;
}

function isBounded(source: SourceFile, range: Span, name: string): boolean {
  const { tokens } = source;
  return ownUses(source, range, name).some(
    (use) =>
      RELATIONS.has(tokens[use + 1]?.text ?? '') || RELATIONS.has(tokens[use - 1]?.text ?? ''),
  );
}

function findIn(source: SourceFile, range: Span, frame: Frame): ValueFound[] {
  const { tokens } = source;
  const mentionsFinite = tokens.slice(range.from, range.to).some(({ text }) => FINITE.has(text));
  if (mentionsFinite) {
    return [];
  }
  const parsed = new Set(
    declarations(source, range)
      .filter((each) => isParsed(source, each))
      .map(({ name }) => name),
  );
  return nanCalls(source, range)
    .filter(({ name }) => parsed.has(name))
    .filter(({ name }) => !isBounded(source, range, name))
    .map(({ name, line }) => ({ name, line, method: frame.name }));
}

export const NAN_GUARD_CHECK: ValueCheck = {
  rule: NAN_GUARD_RULE,
  find: (source) => eachFrame(source, (range, frame) => findIn(source, range, frame)),
  message: ({ name }, kotlin) =>
    `\`${name}.isNaN()\` is the only check on a parsed number, but \`Infinity\` and ` +
    `\`-Infinity\` pass it (\`"Infinity"\` and \`"1e999"\` parse to them), so the ` +
    `value goes on as a limit or amount; check ` +
    `\`${kotlin ? `${name}.isFinite()` : `Double.isFinite(${name})`}\` instead.`,
  allowed:
    'Check `Double.isFinite(x)` (Kotlin `x.isFinite()`), which rejects NaN and both infinities.',
};
