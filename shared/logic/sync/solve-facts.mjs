import { decideByTruthTable, needsValues } from '../propositional.mjs';
import { decideSync } from './decide-sync.mjs';

const MAX_FACTS = 24;
const REASON_TRIES = 6;

function sharesName(known, reached) {
  return [...known.names].some((name) => reached.has(name));
}

function joinedRound(facts, kept, reached) {
  const joined = facts.filter((known) => !kept.has(known) && sharesName(known, reached));
  for (const known of joined) {
    kept.add(known);
  }
  for (const name of joined.flatMap((known) => [...known.names])) {
    reached.add(name);
  }
  return joined.length > 0;
}

/**
 * The facts that bear on `names`: those that name one of them, then those that name a name a kept
 * fact names, and so on. Only the latest few are kept, so the solver stays fast.
 */
export function relevantFacts(facts, names) {
  const reached = new Set(names);
  const kept = new Set();
  const rounds = [facts];
  for (const round of rounds) {
    if (joinedRound(round, kept, reached)) {
      rounds.push(facts);
    }
  }
  return facts.filter((known) => kept.has(known)).slice(-MAX_FACTS);
}

/** 'true', 'false' or 'open' for `query` under `conditions`: a truth table first, then Z3. */
export function solveFacts(conditions, query) {
  const quick = decideByTruthTable(conditions, query);
  if (quick !== 'open' && quick !== undefined) {
    return quick;
  }
  return quick === undefined || needsValues(conditions, query)
    ? decideSync(conditions, query)
    : 'open';
}

/** The latest fact that alone gives `query` its `verdict`, if one of the last few does. */
export function decidingFact(facts, query, verdict) {
  return facts
    .toReversed()
    .slice(0, REASON_TRIES)
    .find((known) => solveFacts([known.term], query) === verdict);
}
