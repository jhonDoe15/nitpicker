import {
  COUNT,
  countInMessage,
  withCountRatchets,
} from '../../../../../shared/rules/counts/count-ratchet.mjs';

const DETEKT_TOOL = 'detekt';

const inMessage = (template, unit) => ({
  pattern: new RegExp(template.replace('{count}', COUNT), 'du'),
  unit,
});

const MESSAGE_COUNTS = new Map([
  ['ReturnCount', inMessage('has {count} return statements', 'return statements')],
  ['LongMethod', inMessage(String.raw`is too long \({count}\)`, 'lines')],
  [
    'CyclomaticComplexMethod',
    inMessage(String.raw`\(complexity: {count}\)`, 'cyclomatic complexity'),
  ],
  [
    'CognitiveComplexMethod',
    inMessage(String.raw`\(complexity: {count}\)`, 'cognitive complexity'),
  ],
  ['ComplexCondition', inMessage(String.raw`too complex \({count}\)`, 'condition complexity')],
  ['TooManyFunctions', inMessage("with '{count}' functions", 'functions')],
  [
    'NestedScopeFunctions',
    inMessage(String.raw`nested too deeply \('{count}'\)`, 'scope function nesting'),
  ],
  ['MethodOverloading', inMessage('overloaded {count} times', 'overloads')],
  [
    'DestructuringDeclarationWithTooManyEntries',
    inMessage('contains {count} but', 'destructured entries'),
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
      index.set(id, index.has(id) ? null : entry.value);
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
    .map((key) => index.get(JSON.stringify(key)))
    .find((value) => value !== undefined && value !== null);
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
