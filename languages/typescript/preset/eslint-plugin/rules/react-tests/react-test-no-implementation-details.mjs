import {
  descendants,
  inReactTestFilesOnly,
  isReactExpression,
  reactBindingNames,
} from './react-test-files.mjs';
import { mockedModuleSource } from '../analysis/test-code-analysis.mjs';

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
const stateMethods = new Set(['state', 'setState']);
const wrapperFactories = new Map([
  ['enzyme', new Set(['mount', 'shallow', 'render'])],
  ['react-test-renderer', new Set(['create'])],
]);
const factoryNames = new Set([...wrapperFactories.values()].flatMap((names) => [...names]));
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
  const name = mockedModuleSource(node);
  return mockedModules.has(name) ? name : undefined;
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

function importedBindings(statement) {
  const names = wrapperFactories.get(statement.source.value);
  const specifiers = statement.specifiers;
  return {
    namespaces: specifiers.filter(({ type }) => type !== 'ImportSpecifier'),
    functions: specifiers.filter(
      ({ type, imported }) => type === 'ImportSpecifier' && names.has(imported.name),
    ),
  };
}

function factoryBindings(program) {
  const imports = program.body
    .filter(
      ({ type, source }) => type === 'ImportDeclaration' && wrapperFactories.has(source.value),
    )
    .map(importedBindings);
  return {
    functions: localNames(imports, 'functions'),
    namespaces: localNames(imports, 'namespaces'),
  };
}

function localNames(imports, key) {
  return new Set(imports.flatMap((found) => found[key].map(({ local }) => local.name)));
}

function isWrapperFactoryCall(node, bindings) {
  const callee = node?.type === 'AwaitExpression' ? node.argument?.callee : node?.callee;
  if (node === undefined || node === null || callee === undefined) {
    return false;
  }
  if (callee.type === 'Identifier') {
    return bindings.functions.has(callee.name);
  }
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    bindings.namespaces.has(callee.object.name) &&
    factoryNames.has(memberName(callee))
  );
}

function wrapperNames(nodes, bindings) {
  const assigned = nodes.flatMap((node) => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
      return isWrapperFactoryCall(node.init, bindings) ? [node.id.name] : [];
    }
    const assigns = node.type === 'AssignmentExpression' && node.left.type === 'Identifier';
    return assigns && isWrapperFactoryCall(node.right, bindings) ? [node.left.name] : [];
  });
  return new Set(assigned);
}

function usesComponentInternals(callee, method, wrappers) {
  if (method === undefined || !instanceMethods.has(method)) {
    return false;
  }
  if (!stateMethods.has(method)) {
    return true;
  }
  const receiver = callee.object;
  return (
    (receiver.type === 'Identifier' && wrappers.names.has(receiver.name)) ||
    isWrapperFactoryCall(receiver, wrappers.bindings)
  );
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
        'Do not use component state or instances ({{ name }}). Assert what the user sees with `screen.getByRole(...)`. An exception fits only when this is intentional.',
      fiberInternals:
        'Do not read React internals ({{ name }}). Assert what the user sees with `screen.getByRole(...)`. An exception fits only when this is intentional.',
      reactMock:
        'Do not replace `{{ name }}` with a module mock. Assert what the user sees with `screen.getByRole(...)`, or test a custom hook with `renderHook`. An exception fits only when this is intentional.',
      hookSpy:
        'Do not spy on the React hook `{{ name }}`. Assert what the user sees with `screen.getByRole(...)`, or test a custom hook with `renderHook`. An exception fits only when this is intentional.',
    },
  },
  create: inReactTestFilesOnly((context) => {
    const reactNames = reactBindingNames(context.sourceCode, globalReactNames);
    const bindings = factoryBindings(context.sourceCode.ast);
    const nodes = descendants(context.sourceCode.ast, context.sourceCode.visitorKeys);
    const wrappers = { bindings, names: wrapperNames(nodes, bindings) };
    return {
      CallExpression(node) {
        const callee = node.callee;
        const method = callee.type === 'MemberExpression' ? memberName(callee) : undefined;
        if (usesComponentInternals(callee, method, wrappers)) {
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
