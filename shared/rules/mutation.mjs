import { ENFORCED_MUTATION_STATUSES, mutantRuleId } from '../policy.mjs';
import { positiveInteger } from './finding-helpers.mjs';

// Neutral input: one entry per non-killed mutant,
// `{ path, identity, status, label, line?, symbol?, replacement? }`.
// `status` is the Stryker-style status name (`Survived`, `NoCoverage`, `Timeout`, ...); `label` is
// the adapter's description of the mutation and is appended to the status in the message (Stryker
// gives the mutator name, PIT the mutator and its description). `Survived` and `NoCoverage` are
// enforceable; every other status is descriptive. Their messages say what to do, and show the
// replacement code when the adapter knows it.

const REPLACEMENT_LIMIT = 80;

export function mutantFindings(mutants, { tool }) {
  return mutants.map((mutant) => ({
    tool,
    rule: mutantRuleId(mutant.status),
    path: mutant.path,
    identity: mutant.identity,
    message: mutantMessage(mutant),
    classification: ENFORCED_MUTATION_STATUSES.includes(mutant.status)
      ? 'enforceable'
      : 'descriptive',
    ...(mutant.symbol === undefined ? {} : { symbol: mutant.symbol }),
    ...(positiveInteger(mutant.line) === undefined ? {} : { location: { line: mutant.line } }),
  }));
}

export function mutantMessage({ status, label, replacement }) {
  const name = `${status} ${label}`;
  if (status === 'NoCoverage') {
    return `${name}: no test runs this code. Add a test that reaches it.`;
  }
  if (status !== 'Survived') {
    return name;
  }
  if (replacement === undefined) {
    return `${name}: no test fails when this code changes. Add an assertion that would.`;
  }
  const text = String(replacement).replaceAll(/\s+/gu, ' ').trim();
  const shown = text.length > REPLACEMENT_LIMIT ? `${text.slice(0, REPLACEMENT_LIMIT)}…` : text;
  return `${name}: replacing this code with \`${shown}\` fails no test. Add an assertion that would.`;
}
