import {
  countInMessage,
  countPattern,
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
  ['ComplexCondition', countPattern(String.raw`too complex \({count}\)`, 'condition complexity')],
  ['TooManyFunctions', countPattern("with '{count}' functions", 'functions')],
  [
    'NestedScopeFunctions',
    countPattern(String.raw`nested too deeply \('{count}'\)`, 'scope function nesting'),
  ],
  ['MethodOverloading', countPattern('overloaded {count} times', 'overloads')],
  [
    'DestructuringDeclarationWithTooManyEntries',
    countPattern('contains {count} but', 'destructured entries'),
  ],
]);

const MEASURED_COUNTS = new Map([
  ['ThrowsCount', 'throw statements'],
  ['NestedBlockDepth', 'nesting depth'],
  ['LargeClass', 'lines of code'],
  ['LoopWithTooManyJumpStatements', 'break and continue statements'],
  ['LongParameterList', 'parameters'],
]);

const PARAMETER_PRINT = /\(.*\)(?= has too many parameters)/u;

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

export function withDetektCountRatchets(findings, detektCounts = []) {
  const index = measuredIndex(detektCounts);
  return withCountRatchets(findings, (finding) => {
    const rule = ruleName(finding);
    const counted = MESSAGE_COUNTS.get(rule);
    if (counted !== undefined) {
      const count = countInMessage(finding.message, counted.pattern);
      return count === undefined ? undefined : { ...count, unit: counted.unit };
    }
    const unit = MEASURED_COUNTS.get(rule);
    const value = unit === undefined ? undefined : measuredValue(index, finding, rule);
    return value === undefined
      ? undefined
      : { value, unit, subject: finding.message.replace(PARAMETER_PRINT, '(…)') };
  });
}
