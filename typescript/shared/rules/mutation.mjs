import { ENFORCED_MUTATION_STATUSES, mutantRuleId } from '../policy.mjs';

// Neutral input: one entry per non-killed mutant, `{ path, identity, status, label, line?, symbol? }`.
// `status` is the Stryker-style status name (`Survived`, `NoCoverage`, `Timeout`, ...); `label` is
// the adapter's description of the mutation and is appended to the status in the message (Stryker
// gives the mutator name, PIT the mutator and its description). `Survived` and `NoCoverage` are
// enforceable; every other status is descriptive.

export function mutantFindings(mutants, { tool }) {
  return mutants.map((mutant) => ({
    tool,
    rule: mutantRuleId(mutant.status),
    path: mutant.path,
    identity: mutant.identity,
    message: `${mutant.status} ${mutant.label}`,
    classification: ENFORCED_MUTATION_STATUSES.includes(mutant.status)
      ? 'enforceable'
      : 'descriptive',
    ...(mutant.symbol === undefined ? {} : { symbol: mutant.symbol }),
    ...(Number.isInteger(mutant.line) && mutant.line > 0
      ? { location: { line: mutant.line } }
      : {}),
  }));
}
