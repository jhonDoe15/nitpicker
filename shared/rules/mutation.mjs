import { ENFORCED_MUTATION_STATUSES, mutantRuleId } from '../policy.mjs';
import { positiveInteger } from './finding-helpers.mjs';

// Neutral input: one entry per non-killed mutant,
// `{ path, identity, status, label, line?, column?, symbol?, original?, replacement? }`.
// `status` is the Stryker-style status name (`Survived`, `NoCoverage`, `Timeout`, ...); `label` is
// the adapter's description of the mutation and is appended to the status in the message (Stryker
// gives the mutator name, PIT the mutator and its description). `Survived` and `NoCoverage` are
// enforceable; every other status is descriptive. Their messages say what to do, and show the
// replacement code when the adapter knows it.

const REPLACEMENT_LIMIT = 80;
const EQUIVALENT_MUTANT_WAY_OUT =
  'If no input can tell the two apart, simplify the code so this mutant disappears.';

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
    ...mutantLocation(mutant),
  }));
}

function mutantLocation({ line, column }) {
  if (positiveInteger(line) === undefined) {
    return {};
  }
  return {
    location: { line, ...(positiveInteger(column) === undefined ? {} : { column }) },
  };
}

const EMPTY_STRING_FORMS = new Set(['', "''", '""', '``']);

function inlineCode(value) {
  const text = String(value).replaceAll(/\s+/gu, ' ').trim();
  const shown = text.length > REPLACEMENT_LIMIT ? `${text.slice(0, REPLACEMENT_LIMIT)}…` : text;
  if (EMPTY_STRING_FORMS.has(shown)) {
    return "`''` (an empty string)";
  }
  return shown.includes('`') ? `\`\` ${shown} \`\`` : `\`${shown}\``;
}

export function mutantMessage({ status, label, replacement, original, column }) {
  const name = `${status} ${label}${positiveInteger(column) === undefined ? '' : ` at column ${String(column)}`}`;
  if (status === 'NoCoverage') {
    return `${name}: no test runs this code. Add a test that reaches it.`;
  }
  if (status !== 'Survived') {
    return name;
  }
  if (replacement === undefined) {
    return `${name}: no test fails when this code changes. Add an assertion that would. ${EQUIVALENT_MUTANT_WAY_OUT}`;
  }
  const subject = original === undefined ? 'this code' : inlineCode(original);
  return `${name}: replacing ${subject} with ${inlineCode(replacement)} fails no test. Add an assertion that would. ${EQUIVALENT_MUTANT_WAY_OUT}`;
}
