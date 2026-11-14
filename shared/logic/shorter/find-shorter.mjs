import { decideByTruthTable, needsValues } from '../propositional.mjs';
import { solveFacts } from '../sync/solve-facts.mjs';
import { decideSync } from '../sync/decide-sync.mjs';
import { logical, not } from '../terms.mjs';
import { candidatesOf } from './candidates.mjs';
import { guardedLeaves } from './guards.mjs';
import { C_STYLE, renderSkeleton } from './render.mjs';
import { leavesOf, skeletonKey, termOfSkeleton } from './skeleton.mjs';

const MAX_ROUNDS = 8;
const MAX_SOLVER_CALLS = 40;
const SOLVER_TIMEOUT_MS = 5000;

function bothWays(left, right) {
  return logical('||', [logical('&&', [left, right]), logical('&&', [not(left), not(right)])]);
}

function isEquivalent(before, after, budget) {
  const query = bothWays(before, after);
  if (decideByTruthTable([], query) === 'true') {
    return true;
  }
  if (!budget.linked || budget.calls >= MAX_SOLVER_CALLS) {
    return false;
  }
  budget.calls += 1;
  return decideSync([], query, { timeoutMs: SOLVER_TIMEOUT_MS }) === 'true';
}

function decidedByEarlier(site, index) {
  const facts = site.node.kids.slice(0, index).map((kid) => {
    const term = termOfSkeleton(kid);
    return site.node.op === 'and' ? term : not(term);
  });
  const verdict = solveFacts(facts, termOfSkeleton(site.node.kids[index]));
  return verdict === (site.node.op === 'and' ? 'true' : 'false');
}

function reportedElsewhere(candidates) {
  return new Set(
    candidates
      .filter(
        ({ kind, index, site }) => kind === 'delete' && index > 0 && decidedByEarlier(site, index),
      )
      .map(({ result }) => skeletonKey(result)),
  );
}

function implyingOperand({ site, index }, style) {
  const { node } = site;
  const dropped = termOfSkeleton(node.kids[index]);
  const later = node.kids.slice(index + 1);
  const operator = style[node.op].trim();
  for (const kid of later) {
    const term = termOfSkeleton(kid);
    const implies = node.op === 'and' ? solveFacts([term], dropped) : solveFacts([dropped], term);
    if (implies === 'true') {
      const text = renderSkeleton(kid, style);
      return node.op === 'and'
        ? `\`${text}\` later in the same \`${operator}\` implies it`
        : `it implies \`${text}\` later in the same \`${operator}\``;
    }
  }
  return `the other operands of the \`${operator}\` already cover it`;
}

function reasonFor(step, style) {
  const { site } = step;
  if (step.kind === 'delete') {
    return implyingOperand(step, style);
  }
  const text = (index) => renderSkeleton(site.node.kids[index], style);
  return `\`${text(step.first)}\` and \`${text(step.second)}\` of the same \`${style[site.node.op].trim()}\` merge into one`;
}

function firstEquivalent(current, guard, budget) {
  const candidates = candidatesOf(current, guard).filter(
    ({ size }) => size < leavesOf(current).length,
  );
  const skipped = reportedElsewhere(candidates);
  const before = termOfSkeleton(current);
  const tried = new Set(skipped);
  return candidates.find(({ result }) => {
    const id = skeletonKey(result);
    return !tried.has(id) && tried.add(id) && isEquivalent(before, termOfSkeleton(result), budget);
  });
}

/**
 * A condition with fewer operands that is equivalent to `skeleton`, proved by the truth table or the
 * solver, built from its own operands in their original order: `{ form, reasons }`, or `undefined`.
 * Operands that guard a later one, that have an effect or may fail, and conditions with more than
 * 6 distinct atoms are left alone, and so are operands that the ones before them decide.
 */
export function findShorter(skeleton, { style = C_STYLE, ...options }) {
  const guard = guardedLeaves(skeleton, options);
  if (guard === undefined) {
    return undefined;
  }
  const budget = { calls: 0, linked: needsValues([], termOfSkeleton(skeleton)) };
  let current = skeleton;
  const reasons = [];
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const step = firstEquivalent(current, guard, budget);
    if (step === undefined) {
      break;
    }
    reasons.push(reasonFor(step, style));
    current = step.result;
  }
  return reasons.length === 0
    ? undefined
    : { form: renderSkeleton(current, style), reasons, skeleton: current };
}
