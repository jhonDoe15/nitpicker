import { decideByTruthTable, needsValues } from '../propositional.mjs';
import { solveFacts } from '../sync/solve-facts.mjs';
import { solverBudget } from '../sync/budget.mjs';
import { decideSync } from '../sync/decide-sync.mjs';
import { logical, not } from '../terms.mjs';
import { chainOf } from '../../traversal.mjs';
import { candidatesOf } from './candidates.mjs';
import { guardedLeaves } from './guards.mjs';
import { C_STYLE, renderSkeleton } from './render.mjs';
import { leavesOf, skeletonKey, termOfSkeleton } from './skeleton.mjs';

const MAX_ROUNDS = 8;

function bothWays(left, right) {
  return logical('||', [logical('&&', [left, right]), logical('&&', [not(left), not(right)])]);
}

function isEquivalent(before, after, budget) {
  const query = bothWays(before, after);
  if (decideByTruthTable([], query) === 'true') {
    return true;
  }
  return budget.linked && decideSync([], query, { budget: budget.solver }) === 'true';
}

function decidedByEarlier(site, index, solver) {
  const facts = site.node.kids.slice(0, index).map((kid) => {
    const term = termOfSkeleton(kid);
    return site.node.op === 'and' ? term : not(term);
  });
  const verdict = solveFacts(facts, termOfSkeleton(site.node.kids[index]), solver);
  return verdict === (site.node.op === 'and' ? 'true' : 'false');
}

function reportedElsewhere(candidates, solver) {
  return new Set(
    candidates
      .filter(
        ({ kind, index, site }) =>
          kind === 'delete' && index > 0 && decidedByEarlier(site, index, solver),
      )
      .map(({ result }) => skeletonKey(result)),
  );
}

function implyingOperand({ site, index }, { style, solver }) {
  const { node } = site;
  const dropped = termOfSkeleton(node.kids[index]);
  const later = node.kids.slice(index + 1);
  const operator = style[node.op].trim();
  for (const kid of later) {
    const term = termOfSkeleton(kid);
    const implies =
      node.op === 'and' ? solveFacts([term], dropped, solver) : solveFacts([dropped], term, solver);
    if (implies === 'true') {
      const text = renderSkeleton(kid, style);
      return (subject) =>
        node.op === 'and'
          ? `\`${text}\` later in the same \`${operator}\` implies ${subject}`
          : `${subject} implies \`${text}\` later in the same \`${operator}\``;
    }
  }
  return (subject) => `the other operands of the \`${operator}\` already cover ${subject}`;
}

function reasonFor(step, { style, solver }) {
  const { site } = step;
  function text(index) {
    return renderSkeleton(site.node.kids[index], style);
  }
  if (step.kind === 'delete') {
    return { why: implyingOperand(step, { style, solver }), dropped: `\`${text(step.index)}\`` };
  }
  const merged = `\`${text(step.first)}\` and \`${text(step.second)}\` of the same \`${style[site.node.op].trim()}\` merge into one`;
  return { why: () => merged };
}

function reasonsOf(steps) {
  const isAmbiguous = steps.length > 1;
  return steps.map(({ why, dropped }) =>
    why(isAmbiguous && dropped !== undefined ? dropped : 'it'),
  );
}

function firstEquivalent(current, guard, budget) {
  const candidates = candidatesOf(current, guard).filter(
    ({ size }) => size < leavesOf(current).length,
  );
  const skipped = reportedElsewhere(candidates, budget.solver);
  const before = termOfSkeleton(current);
  const tried = new Set(skipped);
  return candidates.find(({ result }) => {
    const id = skeletonKey(result);
    if (tried.has(id)) {
      return false;
    }
    tried.add(id);
    return isEquivalent(before, termOfSkeleton(result), budget);
  });
}

/**
 * A condition with fewer operands that is equivalent to `skeleton`, proved by the truth table or the
 * solver, built from its own operands in their original order: `{ form, reasons }`, or `undefined`.
 * Operands that guard a later one, that have an effect or may fail, and conditions with more than
 * 6 distinct atoms are left alone, and so are operands that the ones before them decide.
 */
export function findShorter(skeleton, { style = C_STYLE, solver = solverBudget(), ...options }) {
  const guard = guardedLeaves(skeleton, options);
  if (guard === undefined) {
    return undefined;
  }
  const budget = { solver, linked: needsValues([], termOfSkeleton(skeleton)) };
  const found = chainOf({ result: skeleton, round: 0 }, (previous) => {
    const step =
      previous.round < MAX_ROUNDS ? firstEquivalent(previous.result, guard, budget) : undefined;
    return step === undefined ? undefined : { ...step, round: previous.round + 1 };
  }).slice(1);
  const current = found.at(-1)?.result;
  return current === undefined
    ? undefined
    : {
        form: renderSkeleton(current, style),
        reasons: reasonsOf(found.map((step) => reasonFor(step, { style, solver }))),
        skeleton: current,
      };
}
