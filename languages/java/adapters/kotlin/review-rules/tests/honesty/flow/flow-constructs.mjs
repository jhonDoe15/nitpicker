import {
  closeOf,
  execAt,
  matchingOpen,
  repeatUntil,
  skipSpace,
  trimmedEnd,
} from '../../discovery/text-scan.mjs';
import { bodyRange, ifBranches, statementEnd, whenBranches } from './flow-bodies.mjs';

const ITERATIONS = [
  'forEach forEachIndexed forEachEntry forEachRemaining onEach onEachIndexed map mapIndexed mapNotNull',
  'flatMap filter filterNot ifPresent ifPresentOrElse collect collectLatest all any none sumOf count',
]
  .join(' ')
  .split(' ');
const IF = /(?<![\w.`])if\s*(?=\()/gu;
const WHEN = /(?<![\w.`])when\s*(?=[({])/gu;
const FOR = /(?<![\w.`])for\s*(?=\()/gu;
const WHILE = /(?<![\w.`])while\s*(?=\()/gu;
const DO = /(?<![\w.`])do\s*(?=\{)/gu;
const ITERATE = new RegExp(String.raw`(?:\?\.|\.)\s*(?:${ITERATIONS.join('|')})\s*(?=\{)`, 'gu');
const REPEAT = /(?<![\w.`])repeat\s*(?=\()/gu;
const SAFE_CALL = /\?\.\s*(?:let|also|run|apply)\s*(?=\{)|\.\s*(?:takeIf|takeUnless)\s*(?=\{)/gu;
const TRY = /(?<![\w.`])try\s*(?=\{)/gu;
const CATCH = /\s*catch\s*\(\s*\w+\s*:\s*([\w.]+)\s*\)\s*(?=\{)/u;
const RUN_CATCHING = /(?<![\w`])runCatching\s*(?=\{)/gu;
const LOGICAL = /&&|\|\|/gu;
const ELVIS = /\?:/gu;
const GET_OR_THROW = /\s*\.\s*getOrThrow\b/u;
const SWALLOWED = new Set(
  [
    'Throwable Error Exception RuntimeException AssertionError',
    'AssertionFailedError ComparisonFailure MultipleFailuresError',
  ]
    .join(' ')
    .split(' '),
);
const THROW = /(?<![\w.])throw\b/u;
const DO_TAIL = /(?<![\w.`])do\s*$/u;
const MAX_CATCHES = 20;
const DO_WINDOW = 8;

function within(scanned, { start, end }, pattern) {
  return [...scanned.code.slice(start, end).matchAll(pattern)].map((match) => ({
    match,
    index: start + match.index,
  }));
}

function lambdaConstruct(scanned, construct, { from, open }) {
  const close = closeOf(scanned, open);
  return { construct, from, to: close + 1, scans: [{ start: open + 1, end: close }] };
}

function ifConstructs(scanned, range) {
  return within(scanned, range, IF).map(({ index, match }) => {
    const { branches, hasElse, end } = ifBranches(scanned, index);
    const open = index + match[0].length;
    const header = { start: open + 1, end: closeOf(scanned, open) };
    return {
      construct: 'if',
      from: index,
      to: end,
      scans: branches,
      branches,
      header,
      exhaustive: hasElse,
    };
  });
}

function whenConstructs(scanned, range) {
  const { code } = scanned;
  return within(scanned, range, WHEN).flatMap(({ index, match }) => {
    const parsed = whenBranches(scanned, index, index + match[0].length);
    const open = index + match[0].length;
    const header =
      code[open] === '(' ? { start: open + 1, end: closeOf(scanned, open) } : undefined;
    return parsed === undefined
      ? []
      : [
          {
            construct: 'when',
            from: index,
            to: parsed.end,
            scans: parsed.branches,
            branches: parsed.branches,
            exhaustive: parsed.exhaustive,
            header,
          },
        ];
  });
}

function isDoWhile(scanned, index) {
  const { code } = scanned;
  const before = trimmedEnd(scanned, index);
  const open = code[before - 1] === '}' ? matchingOpen(scanned, before - 1) : -1;
  return open >= 0 && DO_TAIL.test(code.slice(Math.max(0, open - DO_WINDOW), open));
}

function loopConstructs(scanned, range) {
  const { code } = scanned;
  const headers = [...within(scanned, range, FOR), ...within(scanned, range, WHILE)]
    .filter(({ match, index }) => match[0].startsWith('for') || !isDoWhile(scanned, index))
    .map(({ match, index }) => {
      const open = skipSpace(code, index + match[0].trimEnd().length);
      const close = closeOf(scanned, open);
      const body = bodyRange(scanned, close + 1);
      const header = { start: open + 1, end: close };
      return { construct: 'loop', from: index, to: body.next, scans: [body], header };
    });
  const doLoops = within(scanned, range, DO).map(({ index }) =>
    lambdaConstruct(scanned, 'loop', { from: index, open: skipSpace(code, index + 2) }),
  );
  return [...headers, ...doLoops];
}

function iterationConstructs(scanned, range) {
  const { code } = scanned;
  const chained = within(scanned, range, ITERATE).map(({ index, match }) =>
    lambdaConstruct(scanned, 'loop', { from: index, open: index + match[0].length }),
  );
  const repeats = within(scanned, range, REPEAT).flatMap(({ index, match }) => {
    const open = skipSpace(code, closeOf(scanned, index + match[0].length) + 1);
    return code[open] === '{' ? [lambdaConstruct(scanned, 'loop', { from: index, open })] : [];
  });
  return [...chained, ...repeats];
}

function safeCallConstructs(scanned, range) {
  return within(scanned, range, SAFE_CALL).map(({ index, match }) =>
    lambdaConstruct(scanned, 'safe-call', { from: index, open: index + match[0].length }),
  );
}

function catchClauses(scanned, from) {
  const { code } = scanned;
  const clauses = [];
  const state = { at: from };
  repeatUntil(MAX_CATCHES, () => {
    const found = execAt(code, CATCH, state.at);
    if (found === null) {
      return true;
    }
    const body = bodyRange(scanned, state.at + found[0].length);
    clauses.push({ type: found[1].split('.').at(-1), body });
    state.at = body.next;
    return false;
  });
  return { clauses, end: state.at };
}

function tryConstructs(scanned, range) {
  const { code } = scanned;
  return within(scanned, range, TRY).flatMap(({ index, match }) => {
    const open = index + match[0].length;
    const close = closeOf(scanned, open);
    const { clauses, end } = catchClauses(scanned, close + 1);
    const swallows = clauses.some(
      ({ type, body }) => SWALLOWED.has(type) && !THROW.test(code.slice(body.start, body.end)),
    );
    return swallows
      ? [{ construct: 'try', from: index, to: end, scans: [{ start: open + 1, end: close }] }]
      : [];
  });
}

function runCatchingConstructs(scanned, range) {
  const { code } = scanned;
  return within(scanned, range, RUN_CATCHING).flatMap(({ index, match }) => {
    const found = lambdaConstruct(scanned, 'run-catching', {
      from: index,
      open: index + match[0].length,
    });
    return execAt(code, GET_OR_THROW, found.to) === null ? [found] : [];
  });
}

function operatorConstructs(scanned, range) {
  const { code } = scanned;
  const logical = within(scanned, range, LOGICAL).map(({ index, match }) => ({
    construct: 'logical',
    from: index,
    start: index + match[0].length,
  }));
  const elvis = within(scanned, range, ELVIS).map(({ index }) => ({
    construct: 'elvis',
    from: index,
    start: index + 2,
  }));
  return [...logical, ...elvis].map((entry) => {
    const lambda = execAt(code, /\s*(?:run|let|also|apply)\s*(?=\{)/u, entry.start);
    const open = lambda === null ? -1 : entry.start + lambda[0].length;
    const end = open < 0 ? statementEnd(code, entry.start) : closeOf(scanned, open) + 1;
    return {
      construct: entry.construct,
      from: entry.from,
      to: end,
      scans: [{ start: entry.start, end }],
    };
  });
}

export function constructsIn(scanned, range) {
  return [
    ...ifConstructs(scanned, range),
    ...whenConstructs(scanned, range),
    ...loopConstructs(scanned, range),
    ...iterationConstructs(scanned, range),
    ...safeCallConstructs(scanned, range),
    ...tryConstructs(scanned, range),
    ...runCatchingConstructs(scanned, range),
    ...operatorConstructs(scanned, range),
  ];
}
