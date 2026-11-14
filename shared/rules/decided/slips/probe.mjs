import { counterexampleSync } from '../../../logic/sync/decide-sync.mjs';
import { labelOfTag, minimumOf, widthTag } from '../../../logic/bitvectors/widths.mjs';
import { logical, not, term } from '../../../logic/terms.mjs';
import { conditionTerm } from '../facts.mjs';
import { slipCandidates } from './candidates.mjs';

const OPTIONS = { nonZeroDivisors: true, timeoutMs: 4000 };

function numberLike(text, label) {
  return { ...term('literal', String(text)), ...widthTag(label) };
}

function compared(operator, left, right) {
  return term('binary', operator, [left, right]);
}

function sameAnswer(first, second) {
  return logical('||', [logical('&&', [first, second]), logical('&&', [not(first), not(second)])]);
}

function shownInputs(found) {
  const shown = found.replaceAll(/\b(?:name|member|index|call|this):"(?:bound:)?([^"]*)"/gu, '$1');
  return shown === '' ? 'some inputs' : shown;
}

function textOf(node) {
  return node.text ?? `the expression on line ${String(node.start)}`;
}

function differenceQuery(candidate, scope) {
  const [left, right] = candidate.difference.children.map((side) => conditionTerm(side, scope));
  const label = labelOfTag(candidate.difference);
  return left === undefined || right === undefined || label === undefined
    ? undefined
    : {
        holds: sameAnswer(
          conditionTerm(candidate.node, scope),
          compared(candidate.operator, left, right),
        ),
        label,
        phrase: (found) =>
          `\`${textOf(candidate.node)}\` does not compare the operands: the subtraction overflows for ${shownInputs(found)}`,
        fix: 'Compare the operands directly, or use `Integer.compare`/`Long.compare`.',
      };
}

function comparerQuery(candidate, scope) {
  const [left, right] = candidate.difference.children.map((side) => conditionTerm(side, scope));
  const label = labelOfTag(candidate.difference);
  if (left === undefined || right === undefined || label === undefined) {
    return undefined;
  }
  const zero = numberLike(0, label);
  const result = conditionTerm(candidate.difference, scope);
  return {
    holds: logical('&&', [
      sameAnswer(compared('>', result, zero), compared('>', left, right)),
      sameAnswer(compared('<', result, zero), compared('<', left, right)),
    ]),
    label,
    phrase: (found) =>
      `\`${textOf(candidate.node)}\` is not a valid comparison result: the subtraction overflows for ${shownInputs(found)}`,
    fix: 'Return `Integer.compare(a, b)` (or `Long.compare`) instead of the difference.',
  };
}

function remainderQuery(candidate, scope) {
  const dividend = conditionTerm(candidate.dividend, scope);
  const label = labelOfTag(candidate.dividend);
  return dividend === undefined || label === undefined
    ? undefined
    : {
        holds: compared('>=', dividend, numberLike(0, label)),
        label,
        phrase: (found) =>
          `\`${textOf(candidate.node)}\` never matches a negative value, whose remainder is negative: ${shownInputs(found)}`,
        fix: 'Compare the remainder with 0 (`!= 0`), or use `Math.floorMod`.',
      };
}

function absoluteQuery(candidate, scope) {
  const argument = conditionTerm(candidate.argument, scope);
  const label = labelOfTag(candidate.argument);
  return argument === undefined || label === undefined
    ? undefined
    : {
        holds: not(compared('===', argument, numberLike(minimumOf(label), label))),
        label,
        phrase: () =>
          `\`${textOf(candidate.node)}\` uses \`Math.abs\` as ${candidate.use}, but the absolute value of ${String(minimumOf(label))} is still negative`,
        fix: 'Use `Math.floorMod(x, n)`, or mask the hash with `& Integer.MAX_VALUE`.',
      };
}

const QUERIES = {
  difference: differenceQuery,
  comparer: comparerQuery,
  remainder: remainderQuery,
  absolute: absoluteQuery,
};

function probed(candidate, scan, facts) {
  const query = QUERIES[candidate.kind](candidate, scan.scope);
  if (query === undefined) {
    return [];
  }
  const found = counterexampleSync(
    facts.map(({ term: known }) => known),
    query.holds,
    OPTIONS,
  );
  return found === undefined
    ? []
    : [{ node: candidate.node, subject: query.phrase(found), fix: query.fix }];
}

function isApplicable(candidate, scan) {
  return (
    candidate.kind !== 'remainder' ||
    (scan.scope.kotlin && scan.parameters.has(candidate.dividend.value))
  );
}

/**
 * The integer slips in `root` that the solver can show: `{ node, subject, fix }`. Candidates seen
 * before in this scan are skipped, so a node under two sites is asked once.
 */
export function probeSlips(scan, root, facts) {
  const candidates = slipCandidates(root, scan.unitName)
    .filter((candidate) => isApplicable(candidate, scan))
    .filter((candidate) => !scan.probed.has(candidate.node));
  for (const candidate of candidates) {
    scan.probed.add(candidate.node);
  }
  return candidates.flatMap((candidate) => probed(candidate, scan, facts));
}
