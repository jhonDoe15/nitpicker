import { exceptionEntryText, exceptionSentence } from '../../messages/exception-sentence.mjs';
import { HYGIENE_RULE_IDS } from '../../project-rules/hygiene-rules.mjs';

const RULE = HYGIENE_RULE_IDS.fieldLimitMismatch;
const EXCEPTION =
  'An exception fits a field whose input is limited elsewhere (a constant, a custom validator, a gateway).';
const HINTS = {
  jvm: (n) => `@Size(max = ${String(n)})`,
  typescript: (n) => `@MaxLength(${String(n)})`,
  schema: (n) => `.max(${String(n)})`,
  python: (n) => `Field(max_length=${String(n)})`,
  go: (n) => `validate:"max=${String(n)}"`,
  spec: (n) => `maxLength: ${String(n)}`,
};

function hintFor(fact, n) {
  return (HINTS[fact?.style] ?? ((width) => `a maximum length of ${String(width)}`))(n);
}

function where(fact) {
  return `${fact.file}:${String(fact.line)}`;
}

export function finding({ fact, form, signature, message }) {
  return {
    tool: undefined,
    rule: RULE,
    path: fact.file,
    identity: `${RULE}|${fact.file}|${fact.label}|${form}|${signature}`,
    message: `${message} ${EXCEPTION} ${exceptionSentence(exceptionEntryText({ rule: RULE, path: fact.file }))}`,
    classification: 'enforceable',
    location: { line: fact.line },
  };
}

export function unboundedMessage(fact, column) {
  const n = String(column.width);
  return [
    `${fact.file}: ${fact.label} (line ${String(fact.line)}) is bound from a request`,
    `and stored in a ${n}-character column (${where(column)}), but nothing limits it to ${n} characters,`,
    'so a longer value fails at the database (a 500) instead of being rejected as invalid input.',
    `Add ${hintFor(fact, column.width)}.`,
  ].join(' ');
}

export function looseMessage(fact, column, max) {
  const n = column.width;
  return [
    `${fact.file}: ${fact.label} (line ${String(fact.line)}) admits up to ${String(max)} characters`,
    `but the column (${where(column)}) holds ${String(n)}, so a value of ${String(n + 1)} to`,
    `${String(max)} characters passes validation and fails at the database.`,
    `Lower the bound to ${String(n)} (${hintFor(fact, n)}) or widen the column in a migration.`,
  ].join(' ');
}

export function specMessage(spec, validation, differences) {
  const parts = differences.map(
    ({ label, specValue, validationValue }) =>
      `${label} ${String(specValue)} in the spec and ${String(validationValue)} in the validation`,
  );
  return [
    `${spec.file}: ${spec.label} (line ${String(spec.line)}) disagrees with ${validation.label}`,
    `(${where(validation)}): ${parts.join('; ')}.`,
    'The published contract and the server must state the same bounds; change the one that is wrong.',
  ].join(' ');
}
