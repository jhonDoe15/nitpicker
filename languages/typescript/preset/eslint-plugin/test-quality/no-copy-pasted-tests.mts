import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import type { SourceCode } from '../rules/typed/node-views.mts';
import { callbackOf, chainHasProperty, isCaseCall } from './test-calls.mts';

const MIN_COPIES = 3;
const LITERAL_TOKENS = new Set<string>([
  AST_TOKEN_TYPES.String,
  AST_TOKEN_TYPES.Numeric,
  AST_TOKEN_TYPES.Boolean,
  AST_TOKEN_TYPES.Null,
  AST_TOKEN_TYPES.RegularExpression,
  AST_TOKEN_TYPES.Template,
  'BigInt',
]);

type CaseStatement = TSESTree.ExpressionStatement & {
  readonly expression: TSESTree.CallExpression;
};

function shapeOf(sourceCode: SourceCode, node: TSESTree.Node): string {
  return sourceCode
    .getTokens(node)
    .map((token) => (LITERAL_TOKENS.has(token.type) ? `<${token.type}>` : token.value))
    .join(' ');
}

function isPlainCase(statement: TSESTree.Node): statement is CaseStatement {
  return (
    statement.type === AST_NODE_TYPES.ExpressionStatement &&
    isCaseCall(statement.expression) &&
    !chainHasProperty(statement.expression.callee, 'each') &&
    callbackOf(statement.expression) !== undefined
  );
}

function copiesIn(
  sourceCode: SourceCode,
  statements: readonly TSESTree.Node[],
): TSESTree.CallExpression[][] {
  const groups = new Map<string, TSESTree.CallExpression[]>();
  for (const statement of statements.filter(isPlainCase)) {
    const callback = callbackOf(statement.expression);
    if (callback === undefined) {
      continue;
    }
    const key = shapeOf(sourceCode, callback);
    groups.set(key, [...(groups.get(key) ?? []), statement.expression]);
  }
  return [...groups.values()].filter((calls) => calls.length >= MIN_COPIES);
}

export const rule: TSESLint.RuleModule<'copiedTest'> = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require one it.each table instead of copies of a test' },
    schema: [],
    messages: {
      copiedTest:
        'This test repeats the body of {{count}} others and differs only in its literals. Write one `it.each` table with a row per case.',
    },
  },
  create(context) {
    function check(node: TSESTree.Program | TSESTree.BlockStatement): void {
      for (const calls of copiesIn(context.sourceCode, node.body)) {
        for (const call of calls.slice(MIN_COPIES - 1)) {
          context.report({
            node: call.callee,
            messageId: 'copiedTest',
            data: { count: String(calls.length - 1) },
          });
        }
      }
    }
    return { Program: check, BlockStatement: check };
  },
};
