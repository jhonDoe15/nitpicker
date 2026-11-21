import { hasExactArithmetic, hasVectorOperations } from '../bitvectors/values.mts';
import { hasModels, modelReason } from '../models/models.mts';
import { decideByTruthTable, needsValues } from '../propositional.mts';
import { decideSync } from './decide-sync.mts';
import type { SolverBudget } from '../typed/solver-types.mts';
import type { Term } from '../typed/term-types.mts';

type NamedFact = { readonly names: Iterable<string> };
type TermFact = { readonly term: Term };

const MAX_FACTS = 24;
const REASON_TRIES = 6;

function sharesName(known: NamedFact, reached: ReadonlySet<string>): boolean {
  return [...known.names].some((name) => reached.has(name));
}

function joinedRound<Fact extends NamedFact>(
  facts: readonly Fact[],
  kept: Set<Fact>,
  reached: Set<string>,
): boolean {
  const joined = facts.filter((known) => !kept.has(known) && sharesName(known, reached));
  for (const known of joined) {
    kept.add(known);
  }
  for (const name of joined.flatMap((known) => [...known.names])) {
    reached.add(name);
  }
  return joined.length > 0;
}

export function relevantFacts<Fact extends NamedFact>(
  facts: readonly Fact[],
  names: Iterable<string>,
): Fact[] {
  const reached = new Set(names);
  const kept = new Set<Fact>();
  const rounds = [facts];
  for (const round of rounds) {
    if (joinedRound(round, kept, reached)) {
      rounds.push(facts);
    }
  }
  return facts.filter((known) => kept.has(known)).slice(-MAX_FACTS);
}

export function solveFacts(
  conditions: readonly Term[],
  query: Term,
  budget?: SolverBudget,
): string {
  const quick = decideByTruthTable(conditions, query);
  if (quick !== 'open' && quick !== undefined) {
    return quick;
  }
  const linked = quick === undefined || needsValues(conditions, query);
  const terms = [...conditions, query];
  return linked || hasModels(terms) || hasVectorOperations(terms) || hasExactArithmetic(terms)
    ? decideSync(conditions, query, { budget })
    : 'open';
}

export function decidingFactWithin<Fact extends TermFact>(
  budget: SolverBudget | undefined,
  {
    facts,
    query,
    verdict,
  }: { readonly facts: readonly Fact[]; readonly query: Term; readonly verdict: string },
): Fact | { readonly reason: string } | undefined {
  const modelled = modelReason([query]);
  if (modelled !== undefined && solveFacts([], query, budget) === verdict) {
    return { reason: modelled };
  }
  return facts
    .toReversed()
    .slice(0, REASON_TRIES)
    .find((known) => solveFacts([known.term], query, budget) === verdict);
}

export function decidingFact<Fact extends TermFact>(
  facts: readonly Fact[],
  query: Term,
  verdict: string,
): Fact | { readonly reason: string } | undefined {
  return decidingFactWithin(undefined, { facts, query, verdict });
}
