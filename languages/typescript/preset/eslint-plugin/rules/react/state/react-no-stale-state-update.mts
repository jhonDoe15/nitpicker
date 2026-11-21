import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, contains, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { TYPE_ASSERTIONS, unwrapOf } from '../../typed/syntax-views.mts';
import {
  enclosingFunction,
  isEffectCallback,
  nodesOutsideNestedFunctions,
  type FunctionNode,
} from '../react-effects.mts';
import { setterPair } from '../support/state-pairs.mts';

type MessageId = 'afterAwait' | 'repeated';

const BRANCH_TYPES = new Set<string>([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.SwitchStatement,
  AST_NODE_TYPES.CatchClause,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.LabeledStatement,
  AST_NODE_TYPES.ChainExpression,
]);
const SHORT_CIRCUITS = new Set(['||=', '&&=', '??=']);
const ARITHMETIC = new Set(['+', '-', '*', '/', '%', '**']);

function buildsNextValue(argument: TSESTree.Node): boolean {
  const value = unwrapOf(argument, TYPE_ASSERTIONS);
  return (
    value.type === AST_NODE_TYPES.ArrayExpression ||
    value.type === AST_NODE_TYPES.ObjectExpression ||
    (value.type === AST_NODE_TYPES.BinaryExpression && ARITHMETIC.has(value.operator))
  );
}

function mayBeSkipped(ancestor: TSESTree.Node, below: TSESTree.Node): boolean {
  if (ancestor.type === AST_NODE_TYPES.AssignmentExpression) {
    return SHORT_CIRCUITS.has(ancestor.operator);
  }
  if (ancestor.type === AST_NODE_TYPES.BlockStatement) {
    const isTryBlock =
      ancestor.parent.type === AST_NODE_TYPES.TryStatement && ancestor.parent.block === ancestor;
    return isTryBlock && ancestor.body[0] !== below;
  }
  return BRANCH_TYPES.has(ancestor.type);
}

function isCertain(node: TSESTree.Node, statement: TSESTree.Statement): boolean {
  const chain = [node, ...ancestorsOf(node)];
  const upToStatement = chain.slice(0, chain.indexOf(statement) + 1);
  return !upToStatement.some(
    (ancestor, index) => index > 0 && mayBeSkipped(ancestor, upToStatement[index - 1] ?? node),
  );
}

function alwaysAwaits(statement: TSESTree.Statement): boolean {
  return nodesOutsideNestedFunctions(statement).some(
    (node) => node.type === AST_NODE_TYPES.AwaitExpression && isCertain(node, statement),
  );
}

function earlierSiblings(node: TSESTree.Node): readonly TSESTree.Statement[] {
  const block = node.parent;
  if (block?.type !== AST_NODE_TYPES.BlockStatement) {
    return [];
  }
  return block.body.slice(
    0,
    block.body.findIndex((statement) => statement === node),
  );
}

function awaitedBefore(statement: TSESTree.Statement, fn: FunctionNode): boolean {
  const chain = [statement, ...ancestorsOf(statement)];
  const within = chain.slice(0, chain.indexOf(fn));
  return within.some((node) => earlierSiblings(node).some(alwaysAwaits));
}

function calledEarlier(
  sourceCode: SourceCode,
  statement: TSESTree.Statement,
  setter: TSESTree.Identifier,
): boolean {
  const variable = variableNamed(sourceCode, setter);
  return earlierSiblings(statement).some(
    (earlier) =>
      earlier.type === AST_NODE_TYPES.ExpressionStatement &&
      earlier.expression.type === AST_NODE_TYPES.CallExpression &&
      earlier.expression.callee.type === AST_NODE_TYPES.Identifier &&
      variableNamed(sourceCode, earlier.expression.callee) === variable,
  );
}

function rerunsWithState(
  sourceCode: SourceCode,
  statement: TSESTree.Statement,
  state: TSESLint.Scope.Variable,
): boolean {
  return ancestorsOf(statement).some((ancestor) => {
    const dependencies = isEffectCallback(sourceCode, ancestor)
      ? ancestor.parent.arguments[1]
      : undefined;
    return (
      dependencies !== undefined &&
      state.references.some((reference) => contains(dependencies, reference.identifier))
    );
  });
}

function staleForm(
  sourceCode: SourceCode,
  statement: TSESTree.ExpressionStatement,
  setter: TSESTree.Identifier,
): MessageId | undefined {
  const fn = enclosingFunction(statement);
  if (fn === undefined) {
    return undefined;
  }
  if (fn.async && awaitedBefore(statement, fn)) {
    return 'afterAwait';
  }
  return calledEarlier(sourceCode, statement, setter) ? 'repeated' : undefined;
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow state updates built from a state value that is already out of date',
    },
    schema: [],
    messages: {
      afterAwait:
        '`{{state}}` still holds the value from the render that created this function, but the ' +
        'function has waited on an `await` since: an update made in the meantime is overwritten. ' +
        'Pass an updater, which receives the current value: `{{setter}}((current) => ...)`.',
      repeated:
        '`{{setter}}` was already called earlier in this block, and `{{state}}` does not change ' +
        'until the next render, so this call overwrites that update. Make one call, or pass an ' +
        'updater that receives the pending value: `{{setter}}((current) => ...)`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const statement = node.parent;
        const [argument] = node.arguments;
        if (
          statement.type !== AST_NODE_TYPES.ExpressionStatement ||
          node.callee.type !== AST_NODE_TYPES.Identifier ||
          argument === undefined ||
          !buildsNextValue(argument)
        ) {
          return;
        }
        const pair = setterPair(sourceCode, node.callee);
        const state = pair?.hook === 'useState' ? pair.state : undefined;
        if (!state?.references.some((reference) => contains(argument, reference.identifier))) {
          return;
        }
        const messageId = staleForm(sourceCode, statement, node.callee);
        if (messageId !== undefined && !rerunsWithState(sourceCode, statement, state)) {
          context.report({
            node,
            messageId,
            data: { state: state.name, setter: node.callee.name },
          });
        }
      },
    };
  },
};
