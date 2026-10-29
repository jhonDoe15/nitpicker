import {
  COUNT,
  countInMessage,
  withCountRatchets,
} from '../../../../../shared/rules/counts/count-ratchet.mjs';

const inMessage = (template, unit) => ({
  pattern: new RegExp(template.replace('{count}', COUNT), 'du'),
  unit,
});

const CHECKSTYLE_COUNTS = new Map([
  ['ExecutableStatementCount', inMessage('statement count is {count}', 'executable statements')],
  ['AnonInnerLength', inMessage('class length is {count} lines', 'lines')],
  ['FileLength', inMessage('File length is {count} lines', 'lines')],
  ['LambdaBodyLength', inMessage('body length is {count} lines', 'lines')],
  ['MethodLength', inMessage('length is {count} lines', 'lines')],
  ['OuterTypeNumber', inMessage('Outer types defined is {count}', 'outer types')],
  ['ParameterNumber', inMessage(String.raw`\(found {count}\)`, 'parameters')],
  ['RecordComponentNumber', inMessage('record components is {count}', 'record components')],
  ['MethodCount', inMessage('methods is {count}', 'methods')],
  [
    'BooleanExpressionComplexity',
    inMessage('complexity is {count}', 'boolean expression complexity'),
  ],
  ['ClassDataAbstractionCoupling', inMessage('Coupling is {count}', 'data abstraction coupling')],
  ['ClassFanOutComplexity', inMessage('Complexity is {count}', 'fan-out complexity')],
  ['CyclomaticComplexity', inMessage('Complexity is {count}', 'cyclomatic complexity')],
  ['JavaNCSS', inMessage('is {count}', 'non-commenting source statements')],
  ['NPathComplexity', inMessage('Complexity is {count}', 'NPath complexity')],
  ['NestedForDepth', inMessage('depth is {count}', 'for nesting depth')],
  ['NestedIfDepth', inMessage('depth is {count}', 'if-else nesting depth')],
  ['NestedTryDepth', inMessage('depth is {count}', 'try nesting depth')],
  ['ReturnCount', inMessage('Return count is {count}', 'return statements')],
  ['ThrowsCount', inMessage('Throws count is {count}', 'declared exceptions')],
  [
    'VariableDeclarationUsageDistance',
    inMessage('first usage is {count}', 'statements between declaration and first use'),
  ],
]);

const PMD_COUNTS = new Map([
  ['AvoidDuplicateLiterals', inMessage('appears {count} times', 'repeats of the literal')],
  ['CognitiveComplexity', inMessage('cognitive complexity of {count}', 'cognitive complexity')],
  ['CyclomaticComplexity', inMessage('cyclomatic complexity of {count}', 'cyclomatic complexity')],
  ['NPathComplexity', inMessage('NPath complexity of {count}', 'NPath complexity')],
  ['NcssCount', inMessage('NCSS line count of {count}', 'non-commenting source statements')],
  ['CouplingBetweenObjects', inMessage('A value of {count} may denote', 'coupling')],
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
