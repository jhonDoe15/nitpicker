import { closeOf, skipSpace } from '../../discovery/text-scan.mjs';
import { assertsIn, endsBranch } from './assertion-calls.mjs';
import { constructsIn } from './flow-constructs.mjs';

export const CONTROL_FLOW_RULE = 'AssertionInControlFlow';
export const CONTROL_FLOW_MESSAGE =
  'Assert unconditionally. An assertion inside an if, a when, a loop, a safe call, a try/catch that swallows the failure or a runCatching can be skipped, so the test passes without checking anything: a loop over an empty list, or a branch the data never takes, checks nothing. Assert in every branch (an if/else or when whose branches all assert or fail is fine), or narrow with assertNotNull, assertIs or `?: fail(...)` instead of an if or a safe call. Put a table of cases in a parameterized test (@ParameterizedTest with @MethodSource or @CsvSource, Kotest withData) and assert every time; for a loop over results, assert the whole collection at once (assertEquals(expected, results), shouldContainExactly, AssertJ containsExactly). Do not return early before the assertions, and let assertion errors escape. An exception fits only a case that cannot be stated unconditionally, such as cases generated at run time.';

const PROPERTY_CALL =
  /(?<![\w.`])(?:checkAll|forAll|forNone|forOne|forSome)(?:\s*<[^<>()]*>)?\s*(?=[({])/gu;
const ASSERT_ALL = /(?<![\w.`])assertAll\s*(?=\()/gu;
const PROPERTY_ANNOTATIONS = new Set(['Property', 'Example']);
const RETURN = /(?<![\w.])return\b/u;

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

function exemptRanges(scanned, body) {
  return [...callRanges(scanned, body, PROPERTY_CALL), ...callRanges(scanned, body, ASSERT_ALL)];
}

function insideAny(ranges, offset) {
  return ranges.some(({ start, end }) => offset > start && offset < end);
}

function assertive(scanned, construct) {
  return construct.scans.some(({ start, end }) => assertsIn(scanned, start, end));
}

function everyBranchEnds(scanned, construct) {
  const { branches = [], exhaustive = false } = construct;
  return exhaustive && branches.every(({ start, end }) => endsBranch(scanned, start, end));
}

function flagged(scanned, construct) {
  return assertive(scanned, construct) && !everyBranchEnds(scanned, construct);
}

function earlyReturns(scanned, body, constructs) {
  return constructs
    .filter((entry) => entry.construct === 'if' && !assertive(scanned, entry))
    .filter((entry) =>
      entry.branches.some(({ start, end }) => RETURN.test(scanned.code.slice(start, end))),
    )
    .filter((entry) => assertsIn(scanned, entry.to, body.end))
    .map((entry) => ({ ...entry, construct: 'early-return' }));
}

function outermost(found) {
  return found.filter(
    (entry, index) =>
      !found.slice(0, index).some((outer) => outer.from <= entry.from && entry.to <= outer.to),
  );
}

export function assertionsInControlFlow(scanned, node) {
  const { body } = node;
  if (node.annotations.some(({ name }) => PROPERTY_ANNOTATIONS.has(name))) {
    return [];
  }
  const all = constructsIn(scanned, body).filter((entry) => entry.to <= body.end + 1);
  const headers = all.flatMap(({ header }) => (header === undefined ? [] : [header]));
  const operators = new Set(['logical', 'elvis']);
  const exempt = exemptRanges(scanned, body);
  const kept = all.filter(
    (entry) =>
      !insideAny(exempt, entry.from) &&
      !(operators.has(entry.construct) && insideAny(headers, entry.from)),
  );
  const found = [
    ...kept.filter((entry) => flagged(scanned, entry)),
    ...earlyReturns(scanned, body, kept),
  ].toSorted((left, right) => left.from - right.from || right.to - left.to);
  return outermost(found).map(({ construct, from, to }) => ({ construct, from, to }));
}
