import { counterexampleSync } from '../../../logic/sync/decide-sync.mts';
import { rangeOfTag } from '../../../logic/bitvectors/widths.mts';
import { logical, not, sameAnswer, term } from '../../../logic/terms.mts';
import { tagOf } from '../widths/typed-dispatch.mts';
import { conditionTerm } from '../facts.mts';
import { nodeText } from '../flow/exits.mts';
import { slipCandidates } from './candidates.mts';
import { appendAll } from '../../../lists/lists.mts';
import { textOf as valueText } from '../../../values/readers.mts';
import { present } from '../../../near-duplicates/tree/nodes.mts';
import type { Term } from '../../../logic/typed/term-types.mts';
import type {
  Fact,
  FlowNode,
  FlowScope,
  Scan,
  Slip,
  SlipCandidate,
} from '../typed/decided-types.mts';

type Query = {
  readonly holds: Term;
  readonly phrase: (found: string) => string;
  readonly fix: string;
};
type Candidate<Kind extends SlipCandidate['kind']> = Extract<SlipCandidate, { kind: Kind }>;

const EXPRESSION = 'expression';

const ARITHMETIC_KINDS = new Set(['binary', 'unary', 'conditional', EXPRESSION]);
const OPTIONS = { nonZeroDivisors: true };

function numberLike(
  text: number | bigint,
  { bits, signed }: { readonly bits: number; readonly signed: boolean },
): Term {
  return Object.assign(term('literal', String(text)), { bits, signed });
}

function compared(operator: string, left: Term, right: Term): Term {
  return term('binary', operator, [left, right]);
}

function shownInputs(found: string): string {
  const shown = found.replaceAll(/\b(?:name|member|index|call|this):"(?:bound:)?([^"]*)"/gu, '$1');
  return shown === '' ? 'some inputs' : shown;
}

function differenceQuery(candidate: Candidate<'difference'>, scope: FlowScope): Query | undefined {
  const [left, right] = candidate.difference.children.map((side) => conditionTerm(side, scope));
  const tag = tagOf(candidate.difference);
  return left === undefined || right === undefined || tag === undefined
    ? undefined
    : {
        holds: sameAnswer(
          present(conditionTerm(candidate.node, scope)),
          compared(candidate.operator, left, right),
        ),
        phrase: (found: string) =>
          `\`${nodeText(candidate.node, EXPRESSION)}\` does not compare the operands: ` +
          `the subtraction overflows for ${shownInputs(found)}`,
        fix: scope.go
          ? 'Compare the operands directly, or use `cmp.Compare`.'
          : 'Compare the operands directly, or use `Integer.compare`/`Long.compare`.',
      };
}

function comparerQuery(candidate: Candidate<'comparer'>, scope: FlowScope): Query | undefined {
  const [left, right] = candidate.difference.children.map((side) => conditionTerm(side, scope));
  const tag = tagOf(candidate.difference);
  if (left === undefined || right === undefined || tag === undefined) {
    return undefined;
  }
  const zero = numberLike(0, tag);
  const result = present(conditionTerm(candidate.difference, scope));
  return {
    holds: logical('&&', [
      sameAnswer(compared('>', result, zero), compared('>', left, right)),
      sameAnswer(compared('<', result, zero), compared('<', left, right)),
    ]),
    phrase: (found: string) =>
      `\`${nodeText(candidate.node, EXPRESSION)}\` is not a valid comparison result: ` +
      `the subtraction overflows for ${shownInputs(found)}`,
    fix: scope.go
      ? 'Return `cmp.Compare(a, b)` instead of the difference.'
      : 'Return `Integer.compare(a, b)` (or `Long.compare`) instead of the difference.',
  };
}

function remainderQuery(candidate: Candidate<'remainder'>, scope: FlowScope): Query | undefined {
  const dividend = conditionTerm(candidate.dividend, scope);
  const tag = tagOf(candidate.dividend);
  return dividend === undefined || tag === undefined
    ? undefined
    : {
        holds: compared('>=', dividend, numberLike(0, tag)),
        phrase: (found: string) =>
          `\`${nodeText(candidate.node, EXPRESSION)}\` never matches a negative value, ` +
          `whose remainder is negative: ${shownInputs(found)}`,
        fix: scope.go
          ? 'Compare the remainder with 0 (`!= 0`).'
          : 'Compare the remainder with 0 (`!= 0`), or use `Math.floorMod`.',
      };
}

function absoluteQuery(candidate: Candidate<'absolute'>, scope: FlowScope): Query | undefined {
  const argument = conditionTerm(candidate.argument, scope);
  const tag = tagOf(candidate.argument);
  if (argument === undefined || tag === undefined) {
    return undefined;
  }
  const minimum = rangeOfTag({ bits: tag.bits, signed: tag.signed }).min;
  return {
    holds: not(compared('===', argument, numberLike(minimum, tag))),
    phrase: () =>
      `\`${nodeText(candidate.node, EXPRESSION)}\` uses \`Math.abs\` as ${candidate.use}, ` +
      `but the absolute value of ${String(minimum)} is still negative`,
    fix: 'Use `Math.floorMod(x, n)`, or mask the hash with `& Integer.MAX_VALUE`.',
  };
}

function queryOf(candidate: SlipCandidate, scope: FlowScope): Query | undefined {
  switch (candidate.kind) {
    case 'difference':
      return differenceQuery(candidate, scope);
    case 'comparer':
      return comparerQuery(candidate, scope);
    case 'remainder':
      return remainderQuery(candidate, scope);
    case 'absolute':
      return absoluteQuery(candidate, scope);
  }
}

function probed(candidate: SlipCandidate, scan: Scan, facts: readonly Fact[]): Slip[] {
  const query = queryOf(candidate, scan.scope);
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
    : [{ node: candidate.node, subject: query.phrase(valueText(found)), fix: query.fix }];
}

function operandsOf(candidate: SlipCandidate): readonly FlowNode[] {
  if (candidate.kind === 'remainder') {
    return [candidate.dividend];
  }
  return candidate.kind === 'absolute' ? [candidate.argument] : candidate.difference.children;
}

function isArithmetic(node: FlowNode): boolean {
  const isCall = node.kind === 'call' && node.bits !== undefined && node.model === undefined;
  return isCall || ARITHMETIC_KINDS.has(node.kind);
}

function readsLocal(root: FlowNode, parameters: ReadonlySet<string>): boolean {
  const pending: FlowNode[] = [root];
  for (const node of pending) {
    if (node.kind === 'name' && node.binding === 'bound' && !parameters.has(present(node.value))) {
      return true;
    }
    if (isArithmetic(node)) {
      appendAll(pending, node.children);
    }
  }
  return false;
}

function isApplicable(candidate: SlipCandidate, scan: Scan): boolean {
  const isKnown =
    candidate.kind !== 'remainder' ||
    (scan.scope.remainders && scan.parameters.has(present(candidate.dividend.value)));
  return isKnown && !operandsOf(candidate).some((root) => readsLocal(root, scan.parameters));
}

export function probeSlips(scan: Scan, root: FlowNode, facts: readonly Fact[]): Slip[] {
  const candidates = slipCandidates(root, scan.unitName)
    .filter((candidate) => isApplicable(candidate, scan))
    .filter((candidate) => !scan.probed.has(candidate.node));
  for (const candidate of candidates) {
    scan.probed.remember(candidate.node, true);
  }
  return candidates.flatMap((candidate) => probed(candidate, scan, facts));
}
