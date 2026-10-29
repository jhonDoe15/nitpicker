import {
  anchorAt,
  countInMessage,
  countPattern,
  REMEDIES,
  withCountRatchets,
} from '../../../../../shared/rules/counts/count-ratchet.mjs';

const DETEKT_TOOL = 'detekt';

const MESSAGE_COUNTS = new Map([
  ['ReturnCount', countPattern('has {count} return statements', 'return statements')],
  ['LongMethod', countPattern(String.raw`is too long \({count}\)`, 'lines')],
  [
    'CyclomaticComplexMethod',
    countPattern(String.raw`\(complexity: {count}\)`, 'cyclomatic complexity'),
  ],
  [
    'CognitiveComplexMethod',
    countPattern(String.raw`\(complexity: {count}\)`, 'cognitive complexity'),
  ],
  [
    'ComplexCondition',
    countPattern(String.raw`too complex \({count}\)`, 'conditions', REMEDIES.condition),
  ],
  ['TooManyFunctions', countPattern("with '{count}' functions", 'functions', REMEDIES.file)],
  [
    'NestedScopeFunctions',
    countPattern(
      String.raw`nested too deeply \('{count}'\)`,
      'scope function nesting',
      REMEDIES.nesting,
    ),
  ],
  [
    'MethodOverloading',
    countPattern(
      'overloaded {count} times',
      'overloads',
      'Give the new overload a name of its own.',
    ),
  ],
  [
    'DestructuringDeclarationWithTooManyEntries',
    countPattern(
      'contains {count} but',
      'destructured entries',
      'Destructure only the entries you use.',
    ),
  ],
]);

const MEASURED_COUNTS = new Map([
  ['ThrowsCount', { unit: 'throw statements' }],
  ['NestedBlockDepth', { unit: 'nesting levels', remedy: REMEDIES.nesting }],
  ['LargeClass', { unit: 'lines of code', remedy: REMEDIES.class }],
  ['LoopWithTooManyJumpStatements', { unit: 'break and continue statements' }],
  ['LongParameterList', { unit: 'parameters', remedy: REMEDIES.parameters }],
]);

const PARAMETER_PRINT = /\(.*\)(?= has too many parameters)/u;
const FILE_PATH = /(?<=^File )'.*'(?= with)/u;

function ruleName(finding) {
  return finding.tool === DETEKT_TOOL ? finding.rule.split('.').at(-1) : undefined;
}

function measuredIndex(detektCounts) {
  const index = new Map();
  for (const entry of detektCounts) {
    for (const key of [
      [entry.file, entry.rule, entry.line, entry.column],
      [entry.file, entry.rule, entry.line],
    ]) {
      const id = JSON.stringify(key);
      index.set(id, [...(index.get(id) ?? []), entry.value]);
    }
  }
  return index;
}

function measuredValue(index, finding, rule) {
  const { line, column } = finding.location ?? {};
  return [
    [finding.path, rule, line, column],
    [finding.path, rule, line],
  ]
    .map((key) => index.get(JSON.stringify(key)) ?? [])
    .find((values) => values.length === 1)?.[0];
}

function countOf(index, finding) {
  const rule = ruleName(finding);
  const counted = MESSAGE_COUNTS.get(rule);
  if (counted !== undefined) {
    const count = countInMessage(finding.message, counted.pattern);
    return count === undefined
      ? undefined
      : {
          ...count,
          subject: count.subject.replace(FILE_PATH, 'this file'),
          unit: counted.unit,
          remedy: counted.remedy,
        };
  }
  const measured = MEASURED_COUNTS.get(rule);
  const value = measured === undefined ? undefined : measuredValue(index, finding, rule);
  return value === undefined
    ? undefined
    : { ...measured, value, subject: finding.message.replace(PARAMETER_PRINT, '(…)') };
}

export function withDetektCountRatchets(findings, detektCounts = [], locate = () => undefined) {
  const index = measuredIndex(detektCounts);
  return withCountRatchets(
    findings,
    (finding) => countOf(index, finding),
    (finding) => anchorAt(finding, locate),
  );
}
