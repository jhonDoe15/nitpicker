import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, chainOf, nameOf } from '../../typed/node-views.mts';
import { vitestImportAliases } from '../vitest-aliases.mts';

type Change = {
  readonly node: TSESTree.CallExpression;
  readonly owner: TSESTree.Node | undefined;
  readonly fake: boolean;
};

const TEST_BLOCKS = ['it', 'test', 'describe'];
const VITEST_NAMES = ['vi', 'vitest'];
const VITEST_IMPORTS: ReadonlySet<string> = new Set(VITEST_NAMES);

function callName(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const callee = node.callee;
  const root = chainOf<TSESTree.Node>(callee, (current) => {
    if (current.type === AST_NODE_TYPES.CallExpression) {
      return current.callee;
    }
    return current.type === AST_NODE_TYPES.MemberExpression ? current.object : undefined;
  }).at(-1);
  if (root?.type === AST_NODE_TYPES.Identifier && TEST_BLOCKS.includes(root.name)) {
    return root.name;
  }
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
    ? callee.property.name
    : undefined;
}

function owner(node: TSESTree.Node): TSESTree.Node | undefined {
  for (const current of ancestorsOf(node)) {
    if (current.type === AST_NODE_TYPES.Program) {
      return current;
    }
    if (current.type !== AST_NODE_TYPES.CallExpression) {
      continue;
    }
    const name = callName(current);
    if (name !== undefined && TEST_BLOCKS.includes(name)) {
      return current;
    }
  }
  return undefined;
}

function isInTeardown(node: TSESTree.Node): boolean {
  return ancestorsOf(node).some((current) => {
    const name = callName(current);
    return name !== undefined && ['afterEach', 'afterAll'].includes(name);
  });
}

function governingChange(
  changes: readonly Change[],
  wait: TSESTree.CallExpression,
): Change | undefined {
  for (const scope of chainOf<TSESTree.Node>(owner(wait), owner)) {
    const candidates = changes.filter(
      (change) =>
        change.owner === scope &&
        (callName(scope) === 'describe' ||
          scope.type === AST_NODE_TYPES.Program ||
          change.node.range[0] < wait.range[0]),
    );
    if (candidates.length > 0) {
      return candidates.at(-1);
    }
  }
  return undefined;
}

export const rule: TSESLint.RuleModule<'fakeWait'> = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      fakeWait:
        'Use an explicit completion signal or advanceTimersByTimeAsync and a direct assertion; waitFor advances fake time.',
    },
  },
  create(context) {
    const aliases = new Set(VITEST_NAMES);
    const changes: Change[] = [];
    const waits: TSESTree.CallExpression[] = [];
    return {
      ImportDeclaration(node) {
        for (const alias of vitestImportAliases(VITEST_IMPORTS, node)) {
          aliases.add(alias);
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
          return;
        }
        const object = nameOf(callee.object);
        if (object === undefined || !aliases.has(object)) {
          return;
        }
        const method = callee.property.name;
        if (method === 'waitFor') {
          waits.push(node);
        }
        if (!['useFakeTimers', 'useRealTimers'].includes(method)) {
          return;
        }
        if (isInTeardown(node)) {
          return;
        }
        changes.push({ node, owner: owner(node), fake: method === 'useFakeTimers' });
      },
      'Program:exit'() {
        for (const wait of waits) {
          if (governingChange(changes, wait)?.fake === true) {
            context.report({ node: wait, messageId: 'fakeWait' });
          }
        }
      },
    };
  },
};
