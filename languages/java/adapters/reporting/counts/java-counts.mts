import {
  unitAt,
  countInMessage,
  countPattern,
  REMEDIES,
  withCountRatchets,
} from '../../../../../shared/rules/counts/count-ratchet.mjs';

import { fieldOf, fieldsOf, textOf } from '../../../../../shared/values/readers.mts';

type CountedRule = { readonly pattern: RegExp; readonly unit: string; readonly remedy: string };
type Locate = (file: unknown, line: unknown) => unknown;

const LITERAL = 'Use one constant for the literal.';

const CHECKSTYLE_COUNTS = new Map<string, CountedRule>([
  ['ExecutableStatementCount', countPattern('statement count is {count}', 'executable statements')],
  ['AnonInnerLength', countPattern('class length is {count} lines', 'lines', REMEDIES.class)],
  ['FileLength', countPattern('File length is {count} lines', 'lines', REMEDIES.file)],
  ['LambdaBodyLength', countPattern('body length is {count} lines', 'lines')],
  ['MethodLength', countPattern('length is {count} lines', 'lines')],
  ['OuterTypeNumber', countPattern('Outer types defined is {count}', 'outer types', REMEDIES.file)],
  [
    'ParameterNumber',
    countPattern(String.raw`\(found {count}\)`, 'parameters', REMEDIES.parameters),
  ],
  [
    'RecordComponentNumber',
    countPattern('record components is {count}', 'record components', REMEDIES.class),
  ],
  ['MethodCount', countPattern('methods is {count}', 'methods', REMEDIES.class)],
  [
    'BooleanExpressionComplexity',
    countPattern('complexity is {count}', 'boolean operators', REMEDIES.condition),
  ],
  [
    'ClassDataAbstractionCoupling',
    countPattern('Coupling is {count}', 'instantiated classes', REMEDIES.coupling),
  ],
  [
    'ClassFanOutComplexity',
    countPattern('Complexity is {count}', 'used classes', REMEDIES.coupling),
  ],
  ['CyclomaticComplexity', countPattern('Complexity is {count}', 'cyclomatic complexity')],
  ['JavaNCSS', countPattern('is {count}', 'non-commenting source statements')],
  ['NPathComplexity', countPattern('Complexity is {count}', 'NPath complexity')],
  ['NestedForDepth', countPattern('depth is {count}', 'for nesting levels', REMEDIES.nesting)],
  ['NestedIfDepth', countPattern('depth is {count}', 'if-else nesting levels', REMEDIES.nesting)],
  ['NestedTryDepth', countPattern('depth is {count}', 'try nesting levels', REMEDIES.nesting)],
  ['ReturnCount', countPattern('Return count is {count}', 'return statements')],
  ['ThrowsCount', countPattern('Throws count is {count}', 'declared exceptions')],
  ['MultipleStringLiterals', countPattern('appears {count} times', 'uses of the literal', LITERAL)],
  [
    'VariableDeclarationUsageDistance',
    countPattern(
      'first usage is {count}',
      'statements between declaration and first use',
      'Declare the variable next to its first use.',
    ),
  ],
]);

const PMD_COUNTS = new Map<string, CountedRule>([
  ['AvoidDuplicateLiterals', countPattern('appears {count} times', 'uses of the literal', LITERAL)],
  ['CognitiveComplexity', countPattern('cognitive complexity of {count}', 'cognitive complexity')],
  [
    'CyclomaticComplexity',
    countPattern('cyclomatic complexity of {count}', 'cyclomatic complexity'),
  ],
  ['NPathComplexity', countPattern('NPath complexity of {count}', 'NPath complexity')],
  ['NcssCount', countPattern('NCSS line count of {count}', 'non-commenting source statements')],
  [
    'CouplingBetweenObjects',
    countPattern('A value of {count} may denote', 'coupled types', REMEDIES.coupling),
  ],
]);

const COUPLED_CLASSES = / classes \[.*\]/u;

function countedRule(finding: unknown): CountedRule | undefined {
  const name = (textOf(fieldOf(finding, 'rule')).split('.').at(-1) ?? '').replace(/Check$/u, '');
  const tool = fieldOf(finding, 'tool');
  if (tool === 'checkstyle') {
    return CHECKSTYLE_COUNTS.get(name);
  }
  return tool === 'pmd' ? PMD_COUNTS.get(name) : undefined;
}

function countOf(finding: unknown): unknown {
  const counted = countedRule(finding);
  const count: unknown =
    counted === undefined
      ? undefined
      : countInMessage(fieldOf(finding, 'message'), counted.pattern);
  return count === undefined || counted === undefined
    ? undefined
    : {
        ...fieldsOf(count),
        subject: textOf(fieldOf(count, 'subject')).replace(COUPLED_CLASSES, ' classes'),
        unit: counted.unit,
        remedy: counted.remedy,
      };
}

function noUnit(): undefined {
  return undefined;
}

export function withJavaCountRatchets(
  findings: readonly unknown[],
  locate: Locate = noUnit,
): unknown {
  return withCountRatchets(findings, countOf, (finding: unknown) => unitAt(finding, locate));
}
