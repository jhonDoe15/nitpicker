import { ancestorsOf, chainOf } from '../rules/analysis/ancestry.mjs';
import {
  constantNumber,
  isTestFactoryMember,
  isTestFunctionName,
  memberName,
  moduleBindings,
  propertyKeyName,
  registrationRoot,
  resolveConstant,
} from '../rules/analysis/test-code-analysis.mjs';
import { isFunctionNode } from '../rules/analysis/constant-resolution.mjs';

const TEST_MODULES = new Set(['vitest', '@jest/globals', '@playwright/test', 'mocha']);
const MOCHA_REGISTRATIONS = new Set([
  'it',
  'test',
  'describe',
  'suite',
  'context',
  'specify',
  'before',
  'after',
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
  'suiteSetup',
  'suiteTeardown',
  'setup',
  'teardown',
]);
const RETRY_KEYS = new Set(['retry', 'retries']);
const CONFIGURE_PATH = /^test\.describe(?:\.(?:serial|parallel|default))?\.configure$/u;

function canonical(bindings, name) {
  return bindings.named.get(name) ?? name;
}

function memberPath(callee, bindings) {
  const links = chainOf(callee, (link) =>
    link.type === 'MemberExpression' && memberName(link) !== undefined ? link.object : undefined,
  );
  const root = links.at(-1);
  if (root.type !== 'Identifier') {
    return '';
  }
  const members = links.slice(0, -1).map(memberName);
  return [canonical(bindings, root.name), ...members.toReversed()].join('.');
}

function isOff(context, node) {
  const value = resolveConstant(context, node);
  return (
    constantNumber(context, node) === 0 ||
    (value?.type === 'Literal' && (value.value === false || value.value === null)) ||
    (value?.type === 'Identifier' && value.name === 'undefined')
  );
}

function retryLeaves(context, node) {
  const resolved = resolveConstant(context, node);
  if (resolved?.type !== 'ObjectExpression') {
    return [node];
  }
  return resolved.properties.map((property) =>
    property.type === 'Property' ? property.value : property,
  );
}

function isOffEverywhere(context, node) {
  return retryLeaves(context, node).every((leaf) => isOff(context, leaf));
}

function objectEntries(resolved) {
  const properties = resolved.type === 'ObjectExpression' ? resolved.properties : [];
  return {
    spreads: properties.filter((property) => property.type === 'SpreadElement'),
    retries: properties.filter(
      (property) => property.type === 'Property' && RETRY_KEYS.has(propertyKeyName(property)),
    ),
  };
}

function retryValues(context, node) {
  const pending = [node];
  const seen = new Set();
  const values = [];
  for (const current of pending) {
    const resolved = resolveConstant(context, current);
    if (!resolved || seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    const { spreads, retries } = objectEntries(resolved);
    if (resolved.type === 'ConditionalExpression') {
      pending.push(resolved.consequent, resolved.alternate);
    }
    pending.push(...spreads.map((spread) => spread.argument));
    values.push(...retries.map((property) => property.value));
  }
  return values;
}

function isMochaFunctionCall(node, bindings) {
  const holder = ancestorsOf(node).find(
    (ancestor) => ancestor.type === 'FunctionExpression' || ancestor.type === 'FunctionDeclaration',
  );
  if (holder?.type !== 'FunctionExpression' || holder.parent.type !== 'CallExpression') {
    return false;
  }
  const root = registrationRoot(holder.parent.callee);
  return (
    holder.parent.arguments.includes(holder) && MOCHA_REGISTRATIONS.has(canonical(bindings, root))
  );
}

function isThisRetries(callee) {
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'ThisExpression' &&
    memberName(callee) === 'retries'
  );
}

function isTestRegistration(callee, bindings) {
  if (!isTestFunctionName(canonical(bindings, registrationRoot(callee)))) {
    return false;
  }
  return !(callee.type === 'MemberExpression' && isTestFactoryMember(memberName(callee)));
}

function retryNodes(context, node, bindings) {
  const path = memberPath(node.callee, bindings);
  if (path === 'vi.setConfig' || CONFIGURE_PATH.test(path)) {
    return retryValues(context, node.arguments[0]);
  }
  if (path === 'jest.retryTimes') {
    return node.arguments.slice(0, 1);
  }
  if (isThisRetries(node.callee)) {
    return isMochaFunctionCall(node, bindings) ? node.arguments.slice(0, 1) : [];
  }
  if (!isTestRegistration(node.callee, bindings)) {
    return [];
  }
  return node.arguments
    .slice(1)
    .filter((argument) => !isFunctionNode(argument))
    .flatMap((argument) => retryValues(context, argument));
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      retry:
        'Remove the retry: a test that passes on a later attempt hides a flaky or racy test. Fix the cause, such as waiting on the condition instead of a delay or isolating shared state.',
    },
  },
  create(context) {
    const bindings = moduleBindings(context.sourceCode.ast, TEST_MODULES);
    const reported = new WeakSet();
    return {
      CallExpression(node) {
        for (const retry of retryNodes(context, node, bindings)) {
          if (!reported.has(retry) && !isOffEverywhere(context, retry)) {
            reported.add(retry);
            context.report({ node: retry, messageId: 'retry' });
          }
        }
      },
    };
  },
};
