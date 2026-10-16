import { constantNumber, resolveConstant } from '../../analysis/test-code-analysis.mjs';
import { chainOf } from '../../analysis/ancestry.mjs';

export const TEST_TIMEOUT_CEILING_MS = 10_000;

const TEST_FUNCTIONS = new Set(['it', 'test', 'describe', 'suite']);
const HOOKS = new Set(['beforeAll', 'beforeEach', 'afterAll', 'afterEach', 'before', 'after']);
const TIMEOUT_KEYS = new Set(['timeout', 'testTimeout', 'hookTimeout', 'teardownTimeout']);

function rootName(callee) {
  const current = chainOf(callee, (link) => {
    if (link.type === 'MemberExpression') return link.object;
    return link.type === 'CallExpression' ? link.callee : undefined;
  }).at(-1);
  return current?.type === 'Identifier' ? current.name : undefined;
}

function isFunction(node) {
  return node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression';
}

function timeoutProperties(context, node) {
  const resolved = resolveConstant(context, node);
  if (resolved?.type !== 'ObjectExpression') return [];
  return resolved.properties.filter(
    (property) =>
      property.type === 'Property' &&
      !property.computed &&
      property.key.type === 'Identifier' &&
      TIMEOUT_KEYS.has(property.key.name),
  );
}

function identifierMember(callee) {
  const isMember =
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.property.type === 'Identifier';
  return isMember ? { object: callee.object.name, method: callee.property.name } : undefined;
}

function globalTimeouts(context, node) {
  const member = identifierMember(node.callee);
  if (member?.object === 'vi' && member.method === 'setConfig') {
    return timeoutProperties(context, node.arguments[0]).map((property) => property.value);
  }
  return member?.object === 'jest' && member.method === 'setTimeout'
    ? node.arguments.slice(0, 1)
    : undefined;
}

function isChainedTimeout({ callee }) {
  const isTimeout =
    callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 'timeout';
  return (
    isTimeout &&
    (callee.object.type === 'ThisExpression' || TEST_FUNCTIONS.has(rootName(callee.object)))
  );
}

function argumentTimeouts(context, argument) {
  if (argument === undefined || isFunction(argument)) {
    return [];
  }
  const properties = timeoutProperties(context, argument);
  if (properties.length > 0) {
    return properties.map((property) => property.value);
  }
  return resolveConstant(context, argument)?.type === 'ObjectExpression' ? [] : [argument];
}

function timeoutNodes(context, node) {
  const global = globalTimeouts(context, node);
  if (global !== undefined) {
    return global;
  }
  if (isChainedTimeout(node)) {
    return node.arguments.slice(0, 1);
  }
  const root = rootName(node.callee);
  if (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    ['each', 'for', 'runIf', 'skipIf', 'extend'].includes(node.callee.property.name)
  ) {
    return [];
  }
  if (HOOKS.has(root) && node.callee.type === 'Identifier') {
    return node.arguments.slice(1, 2).flatMap((argument) => argumentTimeouts(context, argument));
  }
  if (!TEST_FUNCTIONS.has(root) || !node.arguments.some(isFunction)) return [];
  return node.arguments.slice(1).flatMap((argument) => argumentTimeouts(context, argument));
}

function reportTimeout(context, timeout) {
  const value = constantNumber(context, timeout);
  if (value === undefined) {
    context.report({ node: timeout, messageId: 'unknownTimeout' });
    return;
  }
  if (value > TEST_TIMEOUT_CEILING_MS) {
    context.report({ node: timeout, messageId: 'raisedTimeout' });
  }
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      raisedTimeout: `Do not raise a test or hook timeout above ${String(TEST_TIMEOUT_CEILING_MS)} ms, the testTimeout nitpicker runs tests with. Make the test faster instead: import code rather than spawning it, and share expensive setup in beforeAll. A genuinely long end-to-end suite can add an exception for this rule in nitpicker.config.json.`,
      unknownTimeout: `Give a test or hook timeout as a number of at most ${String(TEST_TIMEOUT_CEILING_MS)} ms written in this file, or keep the default; make the test faster instead of computing a longer timeout.`,
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        for (const timeout of timeoutNodes(context, node)) reportTimeout(context, timeout);
      },
    };
  },
};
