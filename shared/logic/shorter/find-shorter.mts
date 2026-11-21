import { decideByTruthTable, needsValues } from '../propositional.mts';
import { solveFacts } from '../sync/solve-facts.mts';
import { solverBudget } from '../sync/budget.mts';
import { decideSync } from '../sync/decide-sync.mts';
import { not, sameAnswer } from '../terms.mts';
import { chainOf } from '../../traversal.mts';
import { candidatesOf } from './candidates.mts';
import { guardedLeaves } from './guards.mts';
import { C_STYLE, renderSkeleton } from './render.mts';
import { leavesOf, skeletonKey, termOfSkeleton } from './skeleton.mts';
import { required } from '../typed/term-parts.mts';
import type {
  Candidate,
  Deletion,
  Guard,
  Site,
  Skeleton,
  Style,
} from '../typed/skeleton-types.mts';
import type { SolverBudget } from '../typed/solver-types.mts';
import type { Term } from '../typed/term-types.mts';
import type { GuardOptions } from './guards.mts';

type Budget = { readonly solver: SolverBudget; readonly linked: boolean };
type Round = { readonly result: Skeleton; readonly round: number };
type Link = Round | (Candidate & { readonly round: number });
type Why = { readonly why: (subject: string) => string; readonly dropped?: string };
type FindOptions = GuardOptions & {
  readonly style?: Style | undefined;
  readonly solver?: SolverBudget | undefined;
};

const MAX_ROUNDS = 8;
const OPERAND = 'operand';

function isEquivalent(before: Term, after: Term, budget: Budget): boolean {
  const query = sameAnswer(before, after);
  if (decideByTruthTable([], query) === 'true') {
    return true;
  }
  return budget.linked && decideSync([], query, { budget: budget.solver }) === 'true';
}

function decidedByEarlier(site: Site, index: number, solver: SolverBudget): boolean {
  const facts = site.node.kids.slice(0, index).map((kid) => {
    const term = termOfSkeleton(kid);
    return site.node.op === 'and' ? term : not(term);
  });
  const verdict = solveFacts(
    facts,
    termOfSkeleton(required(site.node.kids[index], OPERAND)),
    solver,
  );
  return verdict === (site.node.op === 'and' ? 'true' : 'false');
}

function reportedElsewhere(candidates: readonly Candidate[], solver: SolverBudget): Set<string> {
  return new Set(
    candidates
      .filter(
        (candidate) =>
          candidate.kind === 'delete' &&
          candidate.index > 0 &&
          decidedByEarlier(candidate.site, candidate.index, solver),
      )
      .map(({ result }) => skeletonKey(result)),
  );
}

function implyingOperand(
  { site, index }: Deletion,
  { style, solver }: { readonly style: Style; readonly solver: SolverBudget },
): (subject: string) => string {
  const { node } = site;
  const dropped = termOfSkeleton(required(node.kids[index], OPERAND));
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

function reasonFor(
  step: Candidate,
  { style, solver }: { readonly style: Style; readonly solver: SolverBudget },
): Why {
  const { site } = step;
  function text(index: number): string {
    return renderSkeleton(required(site.node.kids[index], OPERAND), style);
  }
  if (step.kind === 'delete') {
    return { why: implyingOperand(step, { style, solver }), dropped: `\`${text(step.index)}\`` };
  }
  const merged = `\`${text(step.first)}\` and \`${text(step.second)}\` of the same \`${style[site.node.op].trim()}\` merge into one`;
  return { why: () => merged };
}

function reasonsOf(steps: readonly Why[]): string[] {
  const isAmbiguous = steps.length > 1;
  return steps.map(({ why, dropped }) =>
    why(isAmbiguous && dropped !== undefined ? dropped : 'it'),
  );
}

function firstEquivalent(current: Skeleton, guard: Guard, budget: Budget): Candidate | undefined {
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

function isStep(link: Link): link is Candidate & { readonly round: number } {
  return 'kind' in link;
}

export function findShorter(
  skeleton: Skeleton,
  { style = C_STYLE, solver = solverBudget(), ...options }: FindOptions,
): { readonly form: string; readonly reasons: string[]; readonly skeleton: Skeleton } | undefined {
  const guard = guardedLeaves(skeleton, options);
  if (guard === undefined) {
    return undefined;
  }
  const budget: Budget = { solver, linked: needsValues([], termOfSkeleton(skeleton)) };
  const first: Link = { result: skeleton, round: 0 };
  const found = chainOf(first, (previous: Link): Link | undefined => {
    const step =
      previous.round < MAX_ROUNDS ? firstEquivalent(previous.result, guard, budget) : undefined;
    return step === undefined ? undefined : { ...step, round: previous.round + 1 };
  }).filter(isStep);
  const current = found.at(-1)?.result;
  return current === undefined
    ? undefined
    : {
        form: renderSkeleton(current, style),
        reasons: reasonsOf(found.map((step) => reasonFor(step, { style, solver }))),
        skeleton: current,
      };
}
