import {
  descendants,
  inReactTestFilesOnly,
  isReactExpression,
  reactBindingNames,
} from './react-test-files.mjs';

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
const REACT_MODULE = 'react';
const hookNamePattern = /^use[A-Z]/;
const mockRunners = new Set(['vi', 'jest']);
const mockMethods = new Set(['mock', 'doMock']);
const mockedModules = new Set(['react', 'react-dom']);

function literalTypeName(node) {
  const literal =
    node.typeAnnotation?.type === 'TSLiteralType' ? node.typeAnnotation.literal : node;
  return literal.type === 'Literal' && typeof literal.value === 'string'
    ? literal.value
    : undefined;
}

function plainName(node) {
  if (node.type === 'Identifier') {
    return node.name;
  }
  return node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
}

function staticName(node) {
  return node.type === 'TSAsExpression'
    ? (literalTypeName(node) ?? plainName(node.expression))
    : plainName(node);
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

function mockedModule(node) {
  const { callee } = node;
  const isMock =
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    mockRunners.has(callee.object.name) &&
    mockMethods.has(memberName(callee));
  const [target] = node.arguments;
  const source = target?.type === 'ImportExpression' ? target.source : target;
  const name = source?.type === 'Literal' ? source.value : undefined;
  return isMock && mockedModules.has(name) ? name : undefined;
}

function mockedHooks(node, visitorKeys) {
  const factory = node.arguments[1];
  const keys = factory === undefined ? [] : descendants(factory, visitorKeys);
  return keys
    .filter((key) => key.type === 'Property')
    .map((key) => staticName(key.key))
    .filter((name) => hookNamePattern.test(name ?? ''));
}

function reactMock(node, visitorKeys) {
  const name = mockedModule(node);
  const hooks = name === undefined ? [] : mockedHooks(node, visitorKeys);
  if (hooks.length > 0) {
    return hooks.join('`, `');
  }
  return name === REACT_MODULE ? name : undefined;
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
      reactMock:
        'Do not replace `{{ name }}` with a module mock. Assert what the user sees with `screen.getByRole(...)`, or test a custom hook with `renderHook`. If this is intentional, add an exception for this rule in nitpicker.config.json.',
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
        const mocked = reactMock(node, context.sourceCode.visitorKeys);
        if (mocked !== undefined) {
          context.report({ node, messageId: 'reactMock', data: { name: mocked } });
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
