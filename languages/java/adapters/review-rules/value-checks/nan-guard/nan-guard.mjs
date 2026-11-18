import { declarations, eachFrame, ownUses, textsOf } from '../scan.mjs';

export const NAN_GUARD_RULE = 'NanOnlyGuard';

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

function isParsed(source, { at, end }) {
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

function nanCallAt(tokens, index) {
  if (tokens[index].text !== 'isNaN') {
    return undefined;
  }
  const { line } = tokens[index];
  const staticForm = OWNERS.has(tokens[index - 2]?.text) && tokens[index - 1]?.text === '.';
  if (staticForm && tokens[index + 1]?.text === '(' && tokens[index + 2]?.kind === 'identifier') {
    return { index, name: tokens[index + 2].text, line };
  }
  const receiver = tokens[index - 1]?.text === '.' && tokens[index - 2]?.kind === 'identifier';
  return receiver ? { index, name: tokens[index - 2].text, line } : undefined;
}

function nanCalls(source, { from, to }) {
  const calls = [];
  for (let index = from; index < to; index += 1) {
    const call = nanCallAt(source.tokens, index);
    if (call !== undefined) {
      calls.push(call);
    }
  }
  return calls;
}

function isBounded(source, range, name) {
  const { tokens } = source;
  return ownUses(source, range, name).some(
    (use) => RELATIONS.has(tokens[use + 1]?.text) || RELATIONS.has(tokens[use - 1]?.text),
  );
}

function findIn(source, range, frame) {
  const { tokens } = source;
  const mentionsFinite = tokens.slice(range.from, range.to).some(({ text }) => FINITE.has(text));
  if (mentionsFinite) {
    return [];
  }
  const parsed = declarations(source, range).filter((each) => isParsed(source, each));
  return nanCalls(source, range)
    .filter(({ name }) => parsed.some((each) => each.name === name))
    .filter(({ name }) => !isBounded(source, range, name))
    .map(({ name, line }) => ({ name, line, method: frame.name }));
}

export const NAN_GUARD_CHECK = {
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
