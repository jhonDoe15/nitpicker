import { findVariable, isFunctionNode } from '../../rules/analysis/constant-resolution.mjs';
import { callbackOf, isNestedTest, testCallback } from '../../test-quality/test-calls.mjs';
import { propertyName } from '../unowned-async/nodes.mjs';

const SUBTEST_NAMES = new Set(['test', 'it']);

function isSubtestShaped(call) {
  return (
    call.type === 'CallExpression' &&
    call.callee.type === 'MemberExpression' &&
    SUBTEST_NAMES.has(propertyName(call.callee))
  );
}

function isTestContext(context, identifier) {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const fn = definition?.type === 'Parameter' ? definition.node : undefined;
  return (
    isFunctionNode(fn) &&
    fn.params[0] === definition.name &&
    (isNestedTest(context, fn) || (isSubtestShaped(fn.parent) && callbackOf(fn.parent) === fn))
  );
}

export function subtestCallback(context, call) {
  const { callee } = call;
  const isSubtest =
    isSubtestShaped(call) &&
    callee.object.type === 'Identifier' &&
    isTestContext(context, callee.object);
  return isSubtest ? callbackOf(call) : undefined;
}

export function testBody(context, call) {
  return testCallback(context, call) ?? subtestCallback(context, call);
}

export function isTestBoundary(context, node) {
  return (
    isNestedTest(context, node) ||
    (isFunctionNode(node) &&
      node.parent.type === 'CallExpression' &&
      subtestCallback(context, node.parent) === node)
  );
}
