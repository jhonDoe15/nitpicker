import { startsNewLine } from '../../max-value-sums/source-file.mjs';
import { declarations, eachFrame, ownUses, statementEnd, textsOf } from '../scan.mjs';

const WALL_CLOCK_RULE = 'WallClockElapsed';

const WALL_STATIC = new Set([
  'Instant',
  'LocalDateTime',
  'ZonedDateTime',
  'OffsetDateTime',
  'LocalTime',
]);
const CLOCK_METHODS = new Set(['instant', 'millis']);
const RELATIONS = new Set(['<', '>', '<=', '>=']);
const SUBTRACTION_WINDOW = 8;
const BETWEEN_WINDOW = 12;
const RECORDERS = /^(?:record|observe|timing|distribution)/u;

function isWallRead(tokens, from, to) {
  for (const [offset] of tokens.slice(from, to).entries()) {
    const index = from + offset;
    const { text } = tokens[index];
    const next = tokens[index + 1]?.text;
    const owner = tokens[index - 2]?.text ?? '';
    const dotted = tokens[index - 1]?.text === '.';
    if (text === 'currentTimeMillis' && owner === 'System' && dotted) {
      return true;
    }
    if (text === 'now' && next === '(' && WALL_STATIC.has(owner) && dotted) {
      return true;
    }
    if (CLOCK_METHODS.has(text) && next === '(' && dotted && /clock/iu.test(owner)) {
      return true;
    }
  }
  return false;
}

function wallNames(source, range) {
  const { tokens } = source;
  return new Set(
    declarations(source, range)
      .filter((each) => isWallRead(tokens, each.at + 2, each.end))
      .map(({ name }) => name),
  );
}

function elapsedUse(source, { range, use, walls }) {
  const { tokens } = source;
  const before = tokens[use - 1]?.text;
  const lastBefore = tokens[use - 2];
  const subtraction =
    before === '-' &&
    (isWallRead(tokens, Math.max(range.from, use - SUBTRACTION_WINDOW), use - 1) ||
      walls.has(lastBefore?.text));
  const between =
    textsOf(source, use - 2, use).join('') === 'between(' &&
    isWallRead(tokens, use, use + BETWEEN_WINDOW);
  return subtraction || between;
}

function statementStart(source, range, use) {
  const { tokens } = source;
  const candidates = Array.from(
    { length: Math.max(0, use - range.from) },
    (_, offset) => use - offset,
  );
  const boundary = candidates.find(
    (start) =>
      [';', '{', '}'].includes(tokens[start - 1].text) ||
      (source.kotlin && startsNewLine(tokens, start)),
  );
  return boundary ?? range.from;
}

function usedAsLimit(source, range, use) {
  const { tokens } = source;
  const end = statementEnd(source, use);
  const statement = tokens.slice(statementStart(source, range, use), end);
  if (statement.some(({ text }) => RELATIONS.has(text))) {
    return true;
  }
  return statement.some(
    ({ text }, index) => RECORDERS.test(text) && statement[index + 1]?.text === '(',
  );
}

function reachesSink(source, range, use) {
  if (usedAsLimit(source, range, use)) {
    return true;
  }
  const { tokens } = source;
  const declared = declarations(source, range).find(({ at, end }) => at < use && use < end);
  if (declared === undefined) {
    return false;
  }
  return ownUses(source, { from: declared.end, to: range.to }, declared.name).some(
    (next) =>
      RELATIONS.has(tokens[next + 1]?.text) ||
      RELATIONS.has(tokens[next - 1]?.text) ||
      RECORDERS.test(tokens[source.opener[next] - 1]?.text ?? ''),
  );
}

function findIn(source, range, frame) {
  const walls = wallNames(source, range);
  const { tokens } = source;
  const found = [];
  for (const declaration of declarations(source, range)) {
    if (!walls.has(declaration.name)) {
      continue;
    }
    const uses = ownUses(source, { from: declaration.end, to: range.to }, declaration.name);
    const elapsed = uses.map((use) => elapsedUse(source, { range, use, walls }));
    if (
      uses.length > 0 &&
      elapsed.every(Boolean) &&
      uses.some((use) => reachesSink(source, range, use))
    ) {
      found.push({ line: tokens[declaration.at].line, name: declaration.name, method: frame.name });
    }
  }
  return found;
}

export const WALL_CLOCK_CHECK = {
  rule: WALL_CLOCK_RULE,
  find: (source) => eachFrame(source, (range, frame) => findIn(source, range, frame)),
  message: ({ name }) =>
    `\`${name}\` is read from the wall clock and only used to measure elapsed time, ` +
    `but the clock jumps with NTP corrections and VM pauses, so a timeout fires ` +
    `early or never and a duration turns negative; use \`System.nanoTime()\` (Kotlin ` +
    `\`TimeSource.Monotonic\`) or a \`Stopwatch\`.`,
  allowed:
    'Read `System.nanoTime()` (Kotlin `TimeSource.Monotonic.markNow()`) for both ' +
    'ends, or use a `Stopwatch` or a Micrometer `Timer.Sample`.',
};
