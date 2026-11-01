import { lengthName, nonEmptyComparison, nullishName } from './values.mjs';

export const EXCEPTION_ROUTE = 'An exception fits only when the value cannot be pinned.';

function sideText(sourceCode, node) {
  const length = lengthName(node);
  if (length !== undefined) {
    return `….${length}`;
  }
  const isFixed = node?.type === 'Literal' || nullishName(node) !== undefined;
  return isFixed ? sourceCode.getText(node) : '…';
}

function argumentsText(sourceCode, args) {
  return args.map((argument) => sourceCode.getText(argument)).join(', ');
}

function conditionText(sourceCode, condition) {
  if (condition?.type !== 'BinaryExpression') {
    return sideText(sourceCode, condition);
  }
  return [
    sideText(sourceCode, condition.left),
    condition.operator,
    sideText(sourceCode, condition.right),
  ].join(' ');
}

export function expectText(sourceCode, { expectation }) {
  const { subject, path, args } = expectation;
  const shown = nonEmptyComparison(subject) !== undefined || lengthName(subject) !== undefined;
  const subjectText = shown ? conditionText(sourceCode, subject) : '…';
  return `expect(${subjectText}).${path}(${argumentsText(sourceCode, args)})`;
}

export function assertText(sourceCode, call) {
  const callee = sourceCode.getText(call.callee);
  const [first, second] = call.arguments;
  const inner =
    call.callee.type === 'Identifier' || callee.endsWith('.ok')
      ? conditionText(sourceCode, first)
      : [sideText(sourceCode, first), sideText(sourceCode, second)].join(', ');
  return `${callee}(${inner})`;
}
