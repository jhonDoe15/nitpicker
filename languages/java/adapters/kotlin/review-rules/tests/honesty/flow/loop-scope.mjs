import { functionsOf } from '../../discovery/functions.mjs';
import { closeOf, skipSpace } from '../../discovery/text-scan.mjs';
import { assertsIn } from './assertion-calls.mjs';
import { constructsIn } from './flow-constructs.mjs';

const INT = String.raw`(-?\d[\d_]*)L?`;
const RANGE = String.raw`${INT}\s*(\.\.<|\.\.|until|downTo)\s*${INT}(?:\s+step\s+\d[\d_]*L?)?`;
const FOR_RANGE = new RegExp(String.raw`^\s*\w+\s+in\s+(?:\(\s*${RANGE}\s*\)|${RANGE})\s*$`, 'u');
const RANGE_RECEIVER = new RegExp(String.raw`\(\s*${RANGE}\s*\)\s*$`, 'u');
const REPEAT_COUNT = /^repeat\s*\(\s*(\d[\d_]*)\s*\)/u;
const DO = /^do\b/u;
const RECEIVER_WINDOW = 120;
const PROPERTY_CALL =
  /(?<![\w.`])(?:checkAll|forAll|forNone|forOne|forSome)(?:\s*<[^<>()]*>)?\s*(?=[({])/gu;
const ASSERT_ALL = /(?<![\w.`])assertAll\s*(?=\()/gu;
const CALL = /(?<![\w.`])(?:this\s*\.\s*)?([A-Za-z_]\w*)\s*(?=\()/gu;
const FIRST_STEPS = new Map([
  ['..', (first, last) => last >= first],
  ['..<', (first, last) => last > first],
  ['until', (first, last) => last > first],
  ['downTo', (first, last) => first >= last],
]);

function number(text) {
  return Number(text.replaceAll('_', ''));
}

function nonEmpty(match) {
  if (match === null) {
    return false;
  }
  const values = match.slice(1).filter((part) => part !== undefined);
  const [first, operator, last] = values;
  return FIRST_STEPS.get(operator)(number(first), number(last));
}

export function runsAtLeastOnce(scanned, construct) {
  const { code } = scanned;
  const start = code.slice(construct.from, construct.from + RECEIVER_WINDOW);
  if (construct.construct !== 'loop') {
    return false;
  }
  if (DO.test(start)) {
    return true;
  }
  const repeat = REPEAT_COUNT.exec(start);
  if (repeat !== null) {
    return number(repeat[1]) > 0;
  }
  const { header } = construct;
  if (header !== undefined) {
    return nonEmpty(FOR_RANGE.exec(code.slice(header.start, header.end)));
  }
  const receiver = code.slice(Math.max(0, construct.from - RECEIVER_WINDOW), construct.from);
  return nonEmpty(RANGE_RECEIVER.exec(receiver));
}

function callRanges(scanned, body, pattern) {
  const { code } = scanned;
  return [...code.slice(body.start, body.end).matchAll(pattern)].map((match) => {
    const open = body.start + match.index + match[0].length;
    const close = closeOf(scanned, open);
    const lambda = code[open] === '(' ? skipSpace(code, close + 1) : -1;
    const end = code[lambda] === '{' ? closeOf(scanned, lambda) : close;
    return { start: body.start + match.index, end };
  });
}

export function exemptRanges(scanned, body) {
  return [...callRanges(scanned, body, PROPERTY_CALL), ...callRanges(scanned, body, ASSERT_ALL)];
}

export function insideAny(ranges, offset) {
  return ranges.some(({ start, end }) => offset > start && offset < end);
}

function calledNames(scanned, { start, end }) {
  return new Set([...scanned.code.slice(start, end).matchAll(CALL)].map((match) => match[1]));
}

function helperTable(scanned, tests) {
  const bodies = tests.map(({ body }) => body);
  const helpers = functionsOf(scanned).filter(
    (fn) =>
      !tests.some(({ offset }) => offset === fn.offset) &&
      !bodies.some((body) => fn.offset >= body.start && fn.offset < body.end),
  );
  return Map.groupBy(helpers, ({ name }) => name);
}

function calledHelpers(table, scanned, range) {
  return [...calledNames(scanned, range)].flatMap((name) => table.get(name) ?? []);
}

function assertingHelpers(scanned, table) {
  const memo = new Map();
  const asserts = (fn, seen) => {
    if (!memo.has(fn)) {
      const next = new Set([...seen, fn]);
      const callees = calledHelpers(table, scanned, fn.body).filter((callee) => !next.has(callee));
      const found =
        assertsIn(scanned, fn.body.start, fn.body.end) ||
        callees.some((callee) => asserts(callee, next));
      if (seen.size === 0 || found) {
        memo.set(fn, found);
      }
      return found;
    }
    return memo.get(fn);
  };
  return (fn) => asserts(fn, new Set());
}

function reachedHelpers(scanned, table, test) {
  const reached = new Set();
  const pending = calledHelpers(table, scanned, test.body);
  for (const fn of pending) {
    if (!reached.has(fn)) {
      reached.add(fn);
      pending.push(...calledHelpers(table, scanned, fn.body));
    }
  }
  return [...reached];
}

function outermost(found) {
  return found.filter(
    (entry, index) =>
      !found.slice(0, index).some((outer) => outer.from <= entry.from && entry.to <= outer.to),
  );
}

export function loopScope(scanned, tests) {
  const table = helperTable(scanned, tests);
  const asserting = assertingHelpers(scanned, table);
  const callsAsserting = (range) => calledHelpers(table, scanned, range).some(asserting);
  const loopAsserts = (construct) =>
    construct.scans.some(
      (range) => assertsIn(scanned, range.start, range.end) || callsAsserting(range),
    );
  const helperLoops = (fn) => {
    const exempt = exemptRanges(scanned, fn.body);
    const loops = constructsIn(scanned, fn.body).filter(
      (entry) =>
        entry.construct === 'loop' &&
        entry.to <= fn.body.end + 1 &&
        !insideAny(exempt, entry.from) &&
        !runsAtLeastOnce(scanned, entry) &&
        loopAsserts(entry),
    );
    return outermost(loops.toSorted((left, right) => left.from - right.from || right.to - left.to));
  };
  const reported = new Set();
  return {
    callsAsserting,
    helperLoops: (test) =>
      reachedHelpers(scanned, table, test)
        .flatMap((fn) => helperLoops(fn).map((loop) => ({ ...loop, helper: fn.name })))
        .filter((loop) => !reported.has(loop.from) && reported.add(loop.from)),
  };
}
