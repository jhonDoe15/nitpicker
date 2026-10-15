import { ancestorsOf, chainOf } from '../../analysis/ancestry.mjs';
function callName(node) {
  if (node?.type !== 'CallExpression') return undefined;
  const callee = node.callee;
  const root = chainOf(callee, (current) => {
    if (current.type === 'CallExpression') return current.callee;
    return current.type === 'MemberExpression' ? current.object : undefined;
  }).at(-1);
  if (root.type === 'Identifier' && ['it', 'test', 'describe'].includes(root.name))
    return root.name;
  if (callee.type === 'Identifier') return callee.name;
  return callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : undefined;
}

function owner(node) {
  for (const current of ancestorsOf(node)) {
    if (current.type === 'Program') return current;
    if (current.type !== 'CallExpression') continue;
    if (['it', 'test', 'describe'].includes(callName(current))) return current;
  }
  return undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      fakeWait:
        'Use an explicit completion signal or advanceTimersByTimeAsync and a direct assertion; waitFor advances fake time.',
    },
  },
  create(context) {
    const aliases = new Set(['vi', 'vitest']);
    const changes = [];
    const waits = [];
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'vitest') return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            ['vi', 'vitest'].includes(specifier.imported.name)
          ) {
            aliases.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          !aliases.has(callee.object.name)
        )
          return;
        const method = callee.property.name;
        if (method === 'waitFor') waits.push(node);
        if (!['useFakeTimers', 'useRealTimers'].includes(method)) return;
        for (const current of ancestorsOf(node)) {
          if (['afterEach', 'afterAll'].includes(callName(current))) return;
        }
        changes.push({ node, owner: owner(node), fake: method === 'useFakeTimers' });
      },
      'Program:exit'() {
        for (const wait of waits) {
          for (const scope of chainOf(owner(wait), owner)) {
            const candidates = changes.filter(
              (change) =>
                change.owner === scope &&
                (callName(scope) === 'describe' ||
                  scope.type === 'Program' ||
                  change.node.range[0] < wait.range[0]),
            );
            if (candidates.length > 0) {
              if (candidates.at(-1).fake) context.report({ node: wait, messageId: 'fakeWait' });
              break;
            }
          }
        }
      },
    };
  },
};
