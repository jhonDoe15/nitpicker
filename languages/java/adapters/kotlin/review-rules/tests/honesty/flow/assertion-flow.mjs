import { assertsIn, endsBranch } from './assertion-calls.mjs';
import { constructsIn } from './flow-constructs.mjs';
import { exemptRanges, insideAny, runsAtLeastOnce } from './loop-scope.mjs';

export const CONTROL_FLOW_RULE = 'AssertionInControlFlow';
export const CONTROL_FLOW_MESSAGE =
  'Assert unconditionally. An assertion inside an if, a when, a loop, a safe call, a try/catch that swallows the failure or a runCatching can be skipped, so the test passes without checking anything: a loop over an empty list, or a branch the data never takes, checks nothing; a loop in a same-file helper the test calls counts too. A loop that always runs (repeat(3), for (i in 1..3), a do/while) is fine. Assert in every branch (an if/else or when whose branches all assert or fail is fine), or narrow with assertNotNull, assertIs or `?: fail(...)` instead of an if or a safe call. Put a table of cases in a parameterized test (@ParameterizedTest with @MethodSource or @CsvSource, Kotest withData) and assert every time; for a loop over results, assert the whole collection at once (assertEquals(expected, results), shouldContainExactly, AssertJ containsExactly). Do not return early before the assertions, and let assertion errors escape. An exception fits only a case that cannot be stated unconditionally, such as cases generated at run time.';

const PROPERTY_ANNOTATIONS = new Set(['Property', 'Example']);
const RETURN = /(?<![\w.])return\b/u;

function assertive(scanned, construct, scope) {
  return construct.scans.some(
    (range) =>
      assertsIn(scanned, range.start, range.end) ||
      (construct.construct === 'loop' && scope.callsAsserting(range)),
  );
}

function everyBranchEnds(scanned, construct) {
  const { branches = [], exhaustive = false } = construct;
  return exhaustive && branches.every(({ start, end }) => endsBranch(scanned, start, end));
}

function flagged(scanned, construct, scope) {
  return assertive(scanned, construct, scope) && !everyBranchEnds(scanned, construct);
}

function earlyReturns(scanned, body, constructs) {
  return constructs
    .filter(
      (entry) =>
        entry.construct === 'if' &&
        !entry.scans.some((range) => assertsIn(scanned, range.start, range.end)),
    )
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

export function assertionsInControlFlow(scanned, node, scope) {
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
      !runsAtLeastOnce(scanned, entry) &&
      !(operators.has(entry.construct) && insideAny(headers, entry.from)),
  );
  const found = [
    ...kept.filter((entry) => flagged(scanned, entry, scope)),
    ...earlyReturns(scanned, body, kept),
  ].toSorted((left, right) => left.from - right.from || right.to - left.to);
  return outermost(found).map(({ construct, from, to }) => ({ construct, from, to }));
}
