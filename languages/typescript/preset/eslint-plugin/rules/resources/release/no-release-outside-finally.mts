import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  acquiredName,
  canFailBefore,
  escapes,
  ownNodes,
  releaseOf,
  releasesInRecovery,
} from './release-facts.mts';

type Finding = {
  readonly call: TSESTree.CallExpression;
  readonly method: string;
  readonly name: string;
};

function findingAt(block: TSESTree.BlockStatement, index: number): Finding | undefined {
  const statement = block.body[index];
  const name = statement === undefined ? undefined : acquiredName(statement);
  if (name === undefined) {
    return undefined;
  }
  const later = block.body.slice(index + 1);
  const position = later.findIndex(
    (item) =>
      item.type === AST_NODE_TYPES.ExpressionStatement &&
      releaseOf(item.expression, name) !== undefined,
  );
  const release = later[position];
  if (
    release?.type !== AST_NODE_TYPES.ExpressionStatement ||
    !canFailBefore(later.slice(0, position), name)
  ) {
    return undefined;
  }
  const nodes = later.flatMap(ownNodes);
  const found = releaseOf(release.expression, name);
  if (found === undefined || releasesInRecovery(nodes, name) || escapes(nodes, name)) {
    return undefined;
  }
  return { call: found.call, method: found.method, name };
}

export const rule: TSESLint.RuleModule<'outsideFinally'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a pooled connection, query runner, session or lock to be released in finally',
    },
    schema: [],
    messages: {
      outsideFinally:
        '`{{resource}}.{{method}}()` runs after code that can throw or return early, so a failure skips it and the resource stays checked out until the pool runs dry or the process exits. Put the work in `try { ... } finally { {{resource}}.{{method}}(); }` or declare the resource with `await using`. An exception fits only when nothing between acquiring and releasing can fail or exit.',
    },
  },
  create(context) {
    return {
      BlockStatement(block: TSESTree.BlockStatement) {
        for (const index of block.body.keys()) {
          const finding = findingAt(block, index);
          if (finding !== undefined) {
            context.report({
              node: finding.call,
              messageId: 'outsideFinally',
              data: { resource: finding.name, method: finding.method },
            });
          }
        }
      },
    };
  },
};
