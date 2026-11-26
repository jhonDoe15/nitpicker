import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { variableNamed } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { someNode } from '../../collections/costly-forms/repeated-runs.mts';
import { isEarlyExit, isSettledAcrossAwait } from './early-guards.mts';
import { isCostly, isPureWork } from './pure-work.mts';
import { isGuardTest, isTypeQuery } from './type-queries.mts';
import { innermostRepeat } from '../support/loop-invariance.mts';
import { isSettled } from '../repeated-calls/call-shapes.mts';

const BRANCHING = new Set<string>([
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.LogicalExpression,
]);

function awaits(node: TSESTree.Node): boolean {
  return someNode(node, (child) => child.type === AST_NODE_TYPES.AwaitExpression);
}

export const rule: TSESLint.RuleModule<'workBeforeExit'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow computing a value right before an early exit that leaves without reading it',
    },
    schema: [],
    messages: {
      workBeforeExit:
        '`{{name}}` is worked out before the early exit on the next line, which leaves without reading it, so every call that takes the exit pays for it and throws it away. Move the declaration below the exit; keep it here only if its error must be raised on that path too.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      VariableDeclaration(declaration) {
        const [declarator] = declaration.declarations;
        const { parent } = declaration;
        if (
          declaration.kind !== 'const' ||
          declaration.declarations.length !== 1 ||
          declarator.id.type !== AST_NODE_TYPES.Identifier ||
          declarator.init === null ||
          BRANCHING.has(unwrapped(declarator.init).type) ||
          (parent.type !== AST_NODE_TYPES.BlockStatement && parent.type !== AST_NODE_TYPES.Program)
        ) {
          return;
        }
        const statements: readonly TSESTree.Node[] = parent.body;
        const next = statements[statements.indexOf(declaration) + 1];
        const { name } = declarator.id;
        const readLater = (variableNamed(sourceCode, declarator.id)?.references ?? []).some(
          (reference) => !reference.init && reference.isRead(),
        );
        const { init } = declarator;
        const typeQuery = isTypeQuery(init) && innermostRepeat(declaration) !== undefined;
        if (
          readLater &&
          isEarlyExit(sourceCode, next, name) &&
          (typeQuery
            ? isGuardTest(next.test)
            : isSettled(next.test) &&
              isCostly(sourceCode, init) &&
              isPureWork(sourceCode, init) &&
              (!awaits(init) || isSettledAcrossAwait(sourceCode, next.test)))
        ) {
          context.report({ node: declarator, messageId: 'workBeforeExit', data: { name } });
        }
      },
    };
  },
};
