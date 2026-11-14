import path from 'node:path';
import { readHeadPolicyFile } from '../../../../../../../shared/head-policy.mjs';
import { resolveTestTimeouts } from '../../../../../../../shared/test-timeouts/resolve.mjs';
import {
  constantNumber,
  registrationRoot,
  resolveConstant,
  isTestFactoryMember,
  isTestFunctionName,
} from '../../analysis/test-code-analysis.mjs';
import { isFunctionNode } from '../../analysis/constant-resolution.mjs';

const HOOK_TIMEOUT = 'hookTimeout';
const TEARDOWN_TIMEOUT = 'teardownTimeout';

export { TEST_TIMEOUT_CEILING_MS } from '../../../../../../../shared/test-timeouts/resolve.mjs';

const HOOKS = new Set(['beforeAll', 'beforeEach', 'afterAll', 'afterEach', 'before', 'after']);
const TIMEOUT_KEYS = new Set(['timeout', 'testTimeout', HOOK_TIMEOUT, TEARDOWN_TIMEOUT]);

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
    return timeoutProperties(context, node.arguments[0]).map((property) => ({
      node: property.value,
      hook: [HOOK_TIMEOUT, TEARDOWN_TIMEOUT].includes(property.key.name),
    }));
  }
  return member?.object === 'jest' && member.method === 'setTimeout'
    ? node.arguments.slice(0, 1).map((node) => ({ node, hook: false }))
    : undefined;
}

function isChainedTimeout({ callee }) {
  const isTimeout =
    callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 'timeout';
  return (
    isTimeout &&
    (callee.object.type === 'ThisExpression' || isTestFunctionName(registrationRoot(callee.object)))
  );
}

function argumentTimeouts(context, argument, hook = false) {
  if (argument === undefined || isFunctionNode(argument)) {
    return [];
  }
  const properties = timeoutProperties(context, argument);
  if (properties.length > 0) {
    return properties.map((property) => ({
      node: property.value,
      hook: hook || [HOOK_TIMEOUT, TEARDOWN_TIMEOUT].includes(property.key.name),
    }));
  }
  return resolveConstant(context, argument)?.type === 'ObjectExpression'
    ? []
    : [{ node: argument, hook }];
}

function timeoutNodes(context, node) {
  const global = globalTimeouts(context, node);
  if (global !== undefined) {
    return global;
  }
  if (isChainedTimeout(node)) {
    return node.arguments.slice(0, 1).map((node) => ({ node, hook: false }));
  }
  const root = registrationRoot(node.callee);
  if (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    isTestFactoryMember(node.callee.property.name)
  ) {
    return [];
  }
  if (HOOKS.has(root) && node.callee.type === 'Identifier') {
    return node.arguments
      .slice(1, 2)
      .flatMap((argument) => argumentTimeouts(context, argument, true));
  }
  if (!isTestFunctionName(root) || !node.arguments.some(isFunctionNode)) return [];
  return node.arguments.slice(1).flatMap((argument) => argumentTimeouts(context, argument));
}

function reportTimeout(context, { node: timeout, hook }, limits) {
  const ceiling = hook ? limits.hookDeclarationCeilingMs : limits.testDeclarationCeilingMs;
  const data = { ceiling: String(ceiling), kind: hook ? 'hook' : 'test' };
  const value = constantNumber(context, timeout);
  if (value === undefined) {
    context.report({ node: timeout, messageId: 'unknownTimeout', data });
    return;
  }
  if (value <= 0 || value > ceiling) {
    context.report({ node: timeout, messageId: 'raisedTimeout', data });
  }
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      raisedTimeout:
        'Keep the {{kind}} timeout between 1 and {{ceiling}} ms for this test project. Make the test faster or configure its named project timeout in tools.tests.timeouts.',
      unknownTimeout:
        'Give the {{kind}} timeout as a number between 1 and {{ceiling}} ms written in this file, or keep the default.',
    },
  },
  create(context) {
    const policy = context.settings.nitpickerTestTimeoutPolicy ?? readHeadPolicyFile();
    const limits = resolveTestTimeouts(policy, {
      file: path.relative(context.cwd, context.filename).replaceAll('\\', '/'),
      language: policy.preset === 'javascript' ? 'javascript' : 'typescript',
    });
    return {
      CallExpression(node) {
        for (const timeout of timeoutNodes(context, node)) reportTimeout(context, timeout, limits);
      },
    };
  },
};
