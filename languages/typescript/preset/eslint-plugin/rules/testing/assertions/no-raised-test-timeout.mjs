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

export { TEST_TIMEOUT_CEILING_MS } from '../../../../../../../shared/test-timeouts/resolve.mjs';

const HOOKS = new Set(['beforeAll', 'beforeEach', 'afterAll', 'afterEach']);
const TIMEOUT_KEYS = new Set(['timeout', 'testTimeout', 'hookTimeout', 'teardownTimeout']);

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

function isSetConfig(callee) {
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'vi' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'setConfig'
  );
}

function timeoutNodes(context, node) {
  if (isSetConfig(node.callee)) {
    return timeoutProperties(context, node.arguments[0]).map((property) => ({
      node: property.value,
      hook: ['hookTimeout', 'teardownTimeout'].includes(property.key.name),
    }));
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
    return node.arguments.slice(1, 2).map((node) => ({ node, hook: true }));
  }
  if (!isTestFunctionName(root) || !node.arguments.some(isFunctionNode)) return [];
  return node.arguments.slice(1).flatMap((argument) => {
    if (isFunctionNode(argument)) return [];
    const properties = timeoutProperties(context, argument);
    if (properties.length > 0) {
      return properties.map((property) => ({
        node: property.value,
        hook: ['hookTimeout', 'teardownTimeout'].includes(property.key.name),
      }));
    }
    const resolved = resolveConstant(context, argument);
    return resolved?.type === 'ObjectExpression' ? [] : [{ node: argument, hook: false }];
  });
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
