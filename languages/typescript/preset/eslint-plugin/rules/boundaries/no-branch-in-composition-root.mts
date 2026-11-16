import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf } from '../typed/node-views.mts';
import {
  compositionRootOptionsSchema,
  isCompositionRootFile,
  type CompositionRootOptions,
} from './composition-root-files.mts';
import { mentionsEntryPoint } from '../modules/no-process-globals-outside-main-guard.mts';

function isMainGuard(node: TSESTree.Node | undefined): node is TSESTree.IfStatement {
  return node?.type === AST_NODE_TYPES.IfStatement && mentionsEntryPoint(node.test);
}

function isInMainGuardTest(node: TSESTree.Node): boolean {
  return [node, ...ancestorsOf(node)].some(
    (current) => isMainGuard(current.parent) && current === current.parent.test,
  );
}

function isThrowOnlyGuard(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.IfStatement) {
    return false;
  }
  const body =
    node.consequent.type === AST_NODE_TYPES.BlockStatement
      ? node.consequent.body
      : [node.consequent];
  return (
    node.alternate === null && body.length === 1 && body[0]?.type === AST_NODE_TYPES.ThrowStatement
  );
}

const LOOP_TYPES = [
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
];
const DEFAULT_VALUE_TYPES = new Set<string>([
  AST_NODE_TYPES.Literal,
  AST_NODE_TYPES.TemplateLiteral,
  AST_NODE_TYPES.ObjectExpression,
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.NewExpression,
]);

function isDefaultValue(node: TSESTree.LogicalExpression): boolean {
  return node.operator === '||' && DEFAULT_VALUE_TYPES.has(node.right.type);
}

export const rule: TSESLint.RuleModule<'branch', CompositionRootOptions> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Keep branches out of composition roots, which only wire features together',
    },
    schema: compositionRootOptionsSchema,
    messages: {
      branch:
        "The composition root only wires features: it passes things in and does not branch, loop or default a missing value (`??`, `||`). Move this lookup or decision into the feature's adapters/ or domain/. A guard that only throws may stay: `const container = document.getElementById('root'); if (container === null) { throw new Error('#root is missing'); }` and then `createRoot(container)`. An exception fits only when this branch belongs here.",
    },
  },
  create(context) {
    if (!isCompositionRootFile(context)) {
      return {};
    }
    function report(node: TSESTree.Node): void {
      if (!(isMainGuard(node) || isInMainGuardTest(node) || isThrowOnlyGuard(node))) {
        context.report({ node, messageId: 'branch' });
      }
    }

    return {
      IfStatement: report,
      ConditionalExpression: report,
      SwitchStatement: report,
      ChainExpression: report,
      'LogicalExpression[operator="??"]': report,
      LogicalExpression(node: TSESTree.LogicalExpression) {
        if (isDefaultValue(node)) {
          report(node);
        }
      },
      [LOOP_TYPES.join(', ')]: report,
    };
  },
};
