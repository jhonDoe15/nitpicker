import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { missingInputs } from './memo-key-inputs.mts';
import { importsQueryLibrary, missingQueryInputs, queryParts } from './query-key-inputs.mts';
import { enclosingFunction } from './scope-names.mts';

type MessageId = 'queryKey' | 'cacheKey';

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report a cache or query key that leaves out an input the cached value depends on',
    },
    schema: [],
    messages: {
      queryKey:
        "The queryKey does not name {{names}}, which the queryFn reads, so queries that differ in it share one cache entry and show each other's data. Add {{names}} to the key array, or move it out of the function if it never changes.",
      cacheKey:
        "The cache key does not use {{names}}, but the value stored under it depends on it, so calls that differ in it get each other's result. Add {{names}} to the key, or leave it out of the computation.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const queryLibrary = importsQueryLibrary(sourceCode.ast);
    function backticked(names: readonly string[]): string {
      return names.map((name) => `\`${name}\``).join(', ');
    }
    return {
      ObjectExpression(node: TSESTree.ObjectExpression) {
        const parts = queryLibrary ? queryParts(node) : undefined;
        const owner = enclosingFunction(node);
        if (parts === undefined || owner === undefined) {
          return;
        }
        const names = missingQueryInputs(sourceCode, parts, sourceCode.getScope(owner));
        if (names.length > 0) {
          context.report({
            node: parts.key,
            messageId: 'queryKey',
            data: { names: backticked(names) },
          });
        }
      },
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (node.id.type !== AST_NODE_TYPES.Identifier) {
          return;
        }
        for (const { call, names } of missingInputs(sourceCode, node)) {
          context.report({ node: call, messageId: 'cacheKey', data: { names: backticked(names) } });
        }
      },
    };
  },
};
