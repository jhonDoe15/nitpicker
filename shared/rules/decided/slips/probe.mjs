import { counterexampleSync } from '../../../logic/sync/decide-sync.mjs';
import { rangeOfTag } from '../../../logic/bitvectors/widths.mjs';
import { logical, not, term } from '../../../logic/terms.mjs';
import { tagOf } from '../widths/typed-dispatch.mjs';
import { conditionTerm } from '../facts.mjs';
import { textOf } from '../flow/exits.mjs';
import { slipCandidates } from './candidates.mjs';

const EXPRESSION = 'expression';

const ARITHMETIC_KINDS = new Set(['binary', 'unary', 'conditional', EXPRESSION]);
const OPTIONS = { nonZeroDivisors: true };

function numberLike(text, { bits, signed }) {
  return { ...term('literal', String(text)), bits, signed };
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

function differenceQuery(candidate, scope) {
  const [left, right] = candidate.difference.children.map((side) => conditionTerm(side, scope));
  const tag = tagOf(candidate.difference);
  return left === undefined || right === undefined || tag === undefined
    ? undefined
    : {
        holds: sameAnswer(
          conditionTerm(candidate.node, scope),
          compared(candidate.operator, left, right),
        ),
        phrase: (found) =>
          `\`${textOf(candidate.node, EXPRESSION)}\` does not compare the operands: the subtraction overflows for ${shownInputs(found)}`,
        fix: scope.go
          ? 'Compare the operands directly, or use `cmp.Compare`.'
          : 'Compare the operands directly, or use `Integer.compare`/`Long.compare`.',
      };
}

function comparerQuery(candidate, scope) {
  const [left, right] = candidate.difference.children.map((side) => conditionTerm(side, scope));
  const tag = tagOf(candidate.difference);
  if (left === undefined || right === undefined || tag === undefined) {
    return undefined;
  }
  const zero = numberLike(0, tag);
  const result = conditionTerm(candidate.difference, scope);
  return {
    holds: logical('&&', [
      sameAnswer(compared('>', result, zero), compared('>', left, right)),
      sameAnswer(compared('<', result, zero), compared('<', left, right)),
    ]),
    phrase: (found) =>
      `\`${textOf(candidate.node, EXPRESSION)}\` is not a valid comparison result: the subtraction overflows for ${shownInputs(found)}`,
    fix: scope.go
      ? 'Return `cmp.Compare(a, b)` instead of the difference.'
      : 'Return `Integer.compare(a, b)` (or `Long.compare`) instead of the difference.',
  };
}

function remainderQuery(candidate, scope) {
  const dividend = conditionTerm(candidate.dividend, scope);
  const tag = tagOf(candidate.dividend);
  return dividend === undefined || tag === undefined
    ? undefined
    : {
        holds: compared('>=', dividend, numberLike(0, tag)),
        phrase: (found) =>
          `\`${textOf(candidate.node, EXPRESSION)}\` never matches a negative value, whose remainder is negative: ${shownInputs(found)}`,
        fix: scope.go
          ? 'Compare the remainder with 0 (`!= 0`).'
          : 'Compare the remainder with 0 (`!= 0`), or use `Math.floorMod`.',
      };
}

function absoluteQuery(candidate, scope) {
  const argument = conditionTerm(candidate.argument, scope);
  const tag = tagOf(candidate.argument);
  return argument === undefined || tag === undefined
    ? undefined
    : {
        holds: not(compared('===', argument, numberLike(rangeOfTag(tag).min, tag))),
        phrase: () =>
          `\`${textOf(candidate.node, EXPRESSION)}\` uses \`Math.abs\` as ${candidate.use}, but the absolute value of ${String(rangeOfTag(tag).min)} is still negative`,
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
    { ...OPTIONS, budget: scan.solver },
  );
  return found === undefined
    ? []
    : [{ node: candidate.node, subject: query.phrase(found), fix: query.fix }];
}

function operandsOf(candidate) {
  if (candidate.kind === 'remainder') {
    return [candidate.dividend];
  }
  return candidate.kind === 'absolute' ? [candidate.argument] : candidate.difference.children;
}

function isArithmetic(node) {
  const isCall = node.kind === 'call' && node.bits !== undefined && node.model === undefined;
  return isCall || ARITHMETIC_KINDS.has(node.kind);
}

function readsLocal(root, parameters) {
  const pending = [root];
  for (const node of pending) {
    if (node.kind === 'name' && node.binding === 'bound' && !parameters.has(node.value)) {
      return true;
    }
    if (isArithmetic(node)) {
      pending.push(...node.children);
    }
  }
  return false;
}

function isApplicable(candidate, scan) {
  const isRemainder = candidate.kind === 'remainder';
  const isKnown =
    !isRemainder || (scan.scope.remainders && scan.parameters.has(candidate.dividend.value));
  return isKnown && !operandsOf(candidate).some((root) => readsLocal(root, scan.parameters));
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
