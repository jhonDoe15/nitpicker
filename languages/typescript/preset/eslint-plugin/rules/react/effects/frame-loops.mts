import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { contains, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { constFunctionOf, type FunctionNode } from '../react-effects.mts';
import { globalName, ownNodes } from './effect-resources.mts';

const REQUEST = 'requestAnimationFrame';
const CANCEL = /\bcancelAnimationFrame\b/u;
const exits = new Set<string>([AST_NODE_TYPES.ReturnStatement, AST_NODE_TYPES.ThrowStatement]);

function requestedCallback(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): TSESLint.Scope.Variable | undefined {
  if (
    node.type !== AST_NODE_TYPES.CallExpression ||
    globalName(sourceCode, node.callee) !== REQUEST
  ) {
    return undefined;
  }
  const [callback] = node.arguments;
  return callback?.type === AST_NODE_TYPES.Identifier
    ? variableNamed(sourceCode, callback)
    : undefined;
}

function startedFunction(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): TSESLint.Scope.Variable | undefined {
  return node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.arguments.length === 0
    ? variableNamed(sourceCode, node.callee)
    : requestedCallback(sourceCode, node);
}

function reschedulesItself(
  sourceCode: SourceCode,
  fn: FunctionNode,
  variable: TSESLint.Scope.Variable,
): boolean {
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return false;
  }
  const reschedules = fn.body.body.some(
    (statement) =>
      statement.type === AST_NODE_TYPES.ExpressionStatement &&
      requestedCallback(sourceCode, statement.expression) === variable,
  );
  return reschedules && !ownNodes(fn.body).some((node) => exits.has(node.type));
}

function endlessLoop(
  sourceCode: SourceCode,
  effect: FunctionNode,
  variable: TSESLint.Scope.Variable | undefined,
): boolean {
  const [definition, ...others] = variable?.defs ?? [];
  const fn =
    definition === undefined || others.length > 0 ? undefined : constFunctionOf(definition);
  return (
    variable !== undefined &&
    fn !== undefined &&
    contains(effect, fn) &&
    reschedulesItself(sourceCode, fn, variable)
  );
}

export function endlessFrameLoops(sourceCode: SourceCode, effect: FunctionNode): TSESTree.Node[] {
  if (CANCEL.test(sourceCode.getText(effect))) {
    return [];
  }
  const reported = new Set<TSESLint.Scope.Variable | undefined>();
  return ownNodes(effect.body).filter((node) => {
    const started = startedFunction(sourceCode, node);
    const isNew = !reported.has(started) && endlessLoop(sourceCode, effect, started);
    reported.add(isNew ? started : undefined);
    return isNew;
  });
}
