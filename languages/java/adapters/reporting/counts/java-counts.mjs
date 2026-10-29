import {
  countInMessage,
  countPattern,
  withCountRatchets,
} from '../../../../../shared/rules/counts/count-ratchet.mjs';

const CHECKSTYLE_COUNTS = new Map([
  ['ExecutableStatementCount', countPattern('statement count is {count}', 'executable statements')],
  ['AnonInnerLength', countPattern('class length is {count} lines', 'lines')],
  ['FileLength', countPattern('File length is {count} lines', 'lines')],
  ['LambdaBodyLength', countPattern('body length is {count} lines', 'lines')],
  ['MethodLength', countPattern('length is {count} lines', 'lines')],
  ['OuterTypeNumber', countPattern('Outer types defined is {count}', 'outer types')],
  ['ParameterNumber', countPattern(String.raw`\(found {count}\)`, 'parameters')],
  ['RecordComponentNumber', countPattern('record components is {count}', 'record components')],
  ['MethodCount', countPattern('methods is {count}', 'methods')],
  [
    'BooleanExpressionComplexity',
    countPattern('complexity is {count}', 'boolean expression complexity'),
  ],
  [
    'ClassDataAbstractionCoupling',
    countPattern('Coupling is {count}', 'data abstraction coupling'),
  ],
  ['ClassFanOutComplexity', countPattern('Complexity is {count}', 'fan-out complexity')],
  ['CyclomaticComplexity', countPattern('Complexity is {count}', 'cyclomatic complexity')],
  ['JavaNCSS', countPattern('is {count}', 'non-commenting source statements')],
  ['NPathComplexity', countPattern('Complexity is {count}', 'NPath complexity')],
  ['NestedForDepth', countPattern('depth is {count}', 'for nesting depth')],
  ['NestedIfDepth', countPattern('depth is {count}', 'if-else nesting depth')],
  ['NestedTryDepth', countPattern('depth is {count}', 'try nesting depth')],
  ['ReturnCount', countPattern('Return count is {count}', 'return statements')],
  ['ThrowsCount', countPattern('Throws count is {count}', 'declared exceptions')],
  [
    'VariableDeclarationUsageDistance',
    countPattern('first usage is {count}', 'statements between declaration and first use'),
  ],
]);

const PMD_COUNTS = new Map([
  ['AvoidDuplicateLiterals', countPattern('appears {count} times', 'repeats of the literal')],
  ['CognitiveComplexity', countPattern('cognitive complexity of {count}', 'cognitive complexity')],
  [
    'CyclomaticComplexity',
    countPattern('cyclomatic complexity of {count}', 'cyclomatic complexity'),
  ],
  ['NPathComplexity', countPattern('NPath complexity of {count}', 'NPath complexity')],
  ['NcssCount', countPattern('NCSS line count of {count}', 'non-commenting source statements')],
  ['CouplingBetweenObjects', countPattern('A value of {count} may denote', 'coupling')],
]);

const COUPLED_CLASSES = / classes \[.*\]/u;

function countedRule(finding) {
  const name = finding.rule
    .split('.')
    .at(-1)
    .replace(/Check$/u, '');
  if (finding.tool === 'checkstyle') {
    return CHECKSTYLE_COUNTS.get(name);
  }
  return finding.tool === 'pmd' ? PMD_COUNTS.get(name) : undefined;
}

export function withJavaCountRatchets(findings) {
  return withCountRatchets(findings, (finding) => {
    const counted = countedRule(finding);
    const count =
      counted === undefined ? undefined : countInMessage(finding.message, counted.pattern);
    return count === undefined
      ? undefined
      : {
          ...count,
          subject: count.subject.replace(COUPLED_CLASSES, ' classes'),
          unit: counted.unit,
        };
  });
}
