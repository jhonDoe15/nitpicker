import { inReactTestFilesOnly, isReactExpression, reactBindingNames } from './react-test-files.mjs';

const instanceMethods = new Set([
  'instance',
  'getInstance',
  'state',
  'setState',
  'findByType',
  'findAllByType',
  'findByProps',
  'findAllByProps',
]);
const fiberProperties = new Set([
  '_reactInternals',
  '_reactInternalFiber',
  'stateNode',
  'memoizedState',
  'memoizedProps',
]);
const fiberKeyPrefix = '__react';
const globalReactNames = ['React', 'react'];
const hookNamePattern = /^use[A-Z]/;

function literalTypeName(node) {
  const literal =
    node.typeAnnotation?.type === 'TSLiteralType' ? node.typeAnnotation.literal : node;
  return literal.type === 'Literal' && typeof literal.value === 'string'
    ? literal.value
    : undefined;
}

function staticName(node) {
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'TSAsExpression') {
    return literalTypeName(node) ?? staticName(node.expression);
  }
  return node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
}

function memberName(node) {
  return node.computed ? staticName(node.property) : node.property.name;
}

function isFiberName(name) {
  return name !== undefined && (fiberProperties.has(name) || name.startsWith(fiberKeyPrefix));
}

function spiedHook(node, reactNames) {
  const [target, hook] = node.arguments;
  const spies = node.callee.type === 'MemberExpression' && memberName(node.callee) === 'spyOn';
  const onReact = target !== undefined && isReactExpression(target, reactNames);
  const name = hook === undefined ? undefined : staticName(hook);
  return spies && onReact && hookNamePattern.test(name ?? '') ? name : undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow React component tests that depend on component or hook internals',
    },
    schema: [],
    messages: {
      componentInternals:
        'Do not use component state or instances ({{ name }}). Assert what the user sees with `screen.getByRole(...)`. If this is intentional, add an exception for this rule in nitpicker.config.json.',
      fiberInternals:
        'Do not read React internals ({{ name }}). Assert what the user sees with `screen.getByRole(...)`. If this is intentional, add an exception for this rule in nitpicker.config.json.',
      hookSpy:
        'Do not spy on the React hook `{{ name }}`. Assert what the user sees with `screen.getByRole(...)`, or test a custom hook with `renderHook`. If this is intentional, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create: inReactTestFilesOnly((context) => {
    const reactNames = reactBindingNames(context.sourceCode, globalReactNames);
    return {
      CallExpression(node) {
        const callee = node.callee;
        const method = callee.type === 'MemberExpression' ? memberName(callee) : undefined;
        if (method !== undefined && instanceMethods.has(method)) {
          context.report({ node, messageId: 'componentInternals', data: { name: `${method}()` } });
        }
        const hook = spiedHook(node, reactNames);
        if (hook !== undefined) {
          context.report({ node, messageId: 'hookSpy', data: { name: hook } });
        }
      },
      MemberExpression(node) {
        const name = memberName(node);
        if (isFiberName(name)) {
          context.report({ node, messageId: 'fiberInternals', data: { name } });
        }
      },
    };
  }),
};
