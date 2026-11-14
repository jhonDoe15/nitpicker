import { chainOf } from '../../rules/analysis/ancestry.mjs';
import { inserting } from '../support/ranges.mjs';
import { isDeclared } from '../support/scope.mjs';

const RESTORES = new Map([
  ['useFakeTimers', 'useRealTimers'],
  ['stubGlobal', 'unstubAllGlobals'],
  ['stubEnv', 'unstubAllEnvs'],
]);
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

function rootName(callee) {
  const root = chainOf(callee, (link) =>
    link.type === 'MemberExpression' ? link.object : undefined,
  ).at(-1);
  return root.type === 'Identifier' ? root.name : undefined;
}

function isDescribeBody(block) {
  const call = block.parent?.parent;
  return (
    FUNCTIONS.has(block.parent?.type) &&
    call?.type === 'CallExpression' &&
    call.arguments.includes(block.parent) &&
    rootName(call.callee) === 'describe'
  );
}

function isSuiteLevel(parent) {
  return parent.type === 'Program' || (parent.type === 'BlockStatement' && isDescribeBody(parent));
}

function suiteStatement(call) {
  return chainOf(call, (node) => node.parent).find(
    (node) => node.type === 'ExpressionStatement' && isSuiteLevel(node.parent),
  );
}

function hookIsAvailable(sourceCode, call, subject) {
  return isDeclared(sourceCode, call, 'afterEach') || !isDeclared(sourceCode, call, subject);
}

export function restoreHookFix(sourceCode, call, method) {
  const subject = call.callee.object;
  const anchor = suiteStatement(call);
  if (subject.type !== 'Identifier' || anchor === undefined || !RESTORES.has(method)) {
    return undefined;
  }
  if (!hookIsAvailable(sourceCode, call, subject.name)) {
    return undefined;
  }
  const pad = ' '.repeat(anchor.loc.start.column);
  const hook = `afterEach(() => {\n${pad}  ${subject.name}.${RESTORES.get(method)}();\n${pad}});`;
  return inserting(anchor.range[1], `\n\n${pad}${hook}`);
}
