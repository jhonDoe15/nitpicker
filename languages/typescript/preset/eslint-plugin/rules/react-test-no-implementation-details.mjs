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
const reactObjects = new Set(['React', 'react']);
const hookNamePattern = /^use[A-Z]/;

function staticName(node) {
  if (node.type === 'Identifier') {
    return node.name;
  }
  return node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
}

function memberName(node) {
  return node.computed ? staticName(node.property) : node.property.name;
}

function isFiberName(name) {
  return name !== undefined && (fiberProperties.has(name) || name.startsWith(fiberKeyPrefix));
}

function spiedHook(node) {
  const [target, hook] = node.arguments;
  const spies = node.callee.type === 'MemberExpression' && memberName(node.callee) === 'spyOn';
  const onReact = target?.type === 'Identifier' && reactObjects.has(target.name);
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
        'Do not read or change component state or instances in a test ({{ name }}). Assert what the user sees (`screen.getByRole(...)`, visible text) and drive the component through `userEvent`. If this test cannot avoid the internals, add an exception for this rule in nitpicker.config.json.',
      fiberInternals:
        'Do not read React internals in a test ({{ name }}). Assert what the user sees (`screen.getByRole(...)`, visible text). If this test cannot avoid the internals, add an exception for this rule in nitpicker.config.json.',
      hookSpy:
        'Do not spy on the React hook `{{ name }}` in a test. Render the component and assert what the user sees; test a custom hook through `renderHook` and its result. If this spy is unavoidable, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        const method = callee.type === 'MemberExpression' ? memberName(callee) : undefined;
        if (method !== undefined && instanceMethods.has(method)) {
          context.report({ node, messageId: 'componentInternals', data: { name: `${method}()` } });
        }
        const hook = spiedHook(node);
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
  },
};
