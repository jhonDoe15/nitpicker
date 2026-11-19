import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../../rules/security/security-values.mts';
import { hasArrayType } from '../../../rules/support/checked-types.mts';
import { isReference, plainChainRoot } from './invariants.mts';
import { isItemStable, isIterableStable } from './item-uses.mts';
import { descendants, enclosingLoop } from '../../../rules/loops/loop-shapes.mts';
import { ancestorsOf, contains, type SourceCode } from '../../../rules/typed/node-views.mts';
import {
  isFunction,
  isNamedMember,
  type FunctionNode,
} from '../../../rules/typed/syntax-views.mts';

export type LoopCall = {
  readonly hoistBefore: TSESTree.Statement;
  readonly iterable: TSESTree.Expression;
  readonly item: TSESTree.Identifier;
  readonly body: TSESTree.Node;
  readonly range: TSESTree.Range;
  readonly statement: TSESTree.Statement;
  readonly sequential: boolean;
  readonly loop: TSESTree.ForOfStatement | undefined;
};

const CALLBACK_METHODS = new Set(['map', 'forEach']);

function isPlainChain(node: TSESTree.Node): boolean {
  const root = plainChainRoot(node);
  return root?.type === AST_NODE_TYPES.Identifier || root?.type === AST_NODE_TYPES.ThisExpression;
}

function isStatementIn(node: TSESTree.Node): boolean {
  const { parent } = node;
  return (
    parent !== undefined &&
    (parent.type === AST_NODE_TYPES.BlockStatement || parent.type === AST_NODE_TYPES.Program) &&
    parent.body.some((statement) => statement === node)
  );
}

function touchesIterable(
  sourceCode: SourceCode,
  iterable: TSESTree.Node,
  body: TSESTree.Node,
): boolean {
  const text = sourceCode.getText(iterable);
  return descendants(body, sourceCode.visitorKeys, () => false).some(
    (node) =>
      ((node.type === AST_NODE_TYPES.Identifier && isReference(node)) ||
        node.type === AST_NODE_TYPES.MemberExpression) &&
      sourceCode.getText(node) === text,
  );
}

function statementHolding(
  body: TSESTree.Node,
  call: TSESTree.Node,
): TSESTree.Statement | undefined {
  const statements = body.type === AST_NODE_TYPES.BlockStatement ? body.body : [body];
  return statements.find(
    (statement): statement is TSESTree.Statement =>
      contains(statement, call) && statement.type !== AST_NODE_TYPES.EmptyStatement,
  );
}

function isBreakTarget(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.ForStatement ||
    node.type === AST_NODE_TYPES.ForInStatement ||
    node.type === AST_NODE_TYPES.ForOfStatement ||
    node.type === AST_NODE_TYPES.WhileStatement ||
    node.type === AST_NODE_TYPES.DoWhileStatement ||
    node.type === AST_NODE_TYPES.SwitchStatement
  );
}

function leaves(node: TSESTree.Node, body: TSESTree.Node): boolean {
  if (
    node.type === AST_NODE_TYPES.ReturnStatement ||
    node.type === AST_NODE_TYPES.ThrowStatement ||
    node.type === AST_NODE_TYPES.YieldExpression
  ) {
    return true;
  }
  if (node.type !== AST_NODE_TYPES.BreakStatement) {
    return false;
  }
  const nested = ancestorsOf(node).some((each) => contains(body, each) && isBreakTarget(each));
  return node.label !== null || !nested;
}

function exitsEarly(sourceCode: SourceCode, body: TSESTree.Node): boolean {
  return descendants(body, sourceCode.visitorKeys, isFunction).some((node) => leaves(node, body));
}

function isArrayOf(context: Context, iterable: TSESTree.Node): boolean {
  return isPlainChain(iterable) && hasArrayType(context, iterable) === 'yes';
}

function forOfCall(
  context: Context,
  call: TSESTree.CallExpression,
  loop: TSESTree.ForOfStatement,
): LoopCall | undefined {
  const { left } = loop;
  const declarator =
    left.type === AST_NODE_TYPES.VariableDeclaration ? left.declarations[0] : undefined;
  const statement = statementHolding(loop.body, call);
  if (
    loop.await ||
    declarator === undefined ||
    left.type !== AST_NODE_TYPES.VariableDeclaration ||
    left.declarations.length !== 1 ||
    declarator.id.type !== AST_NODE_TYPES.Identifier ||
    statement === undefined ||
    !isStatementIn(loop) ||
    !isArrayOf(context, loop.right) ||
    touchesIterable(context.sourceCode, loop.right, loop.body) ||
    !isItemStable(context, declarator.id, { body: loop.body, target: call }) ||
    !isIterableStable(context, loop.right, { body: loop.body, target: call }) ||
    exitsEarly(context.sourceCode, loop.body)
  ) {
    return undefined;
  }
  return {
    hoistBefore: loop,
    iterable: loop.right,
    item: declarator.id,
    body: loop.body,
    range: loop.range,
    statement,
    sequential: true,
    loop,
  };
}

function holderOf(mapCall: TSESTree.CallExpression): TSESTree.Statement | undefined {
  let node: TSESTree.Node = mapCall;
  const wrapper = node.parent;
  if (
    wrapper.type === AST_NODE_TYPES.CallExpression &&
    isNamedMember(wrapper.callee, 'Promise', 'all') &&
    wrapper.arguments.length === 1
  ) {
    node = wrapper;
  }
  if (node.parent.type === AST_NODE_TYPES.AwaitExpression) {
    node = node.parent;
  }
  const { parent } = node;
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    const declaration = parent.parent;
    return parent.init === node && declaration.declarations.length === 1 ? declaration : undefined;
  }
  const isStatement =
    (parent.type === AST_NODE_TYPES.ExpressionStatement && parent.expression === node) ||
    (parent.type === AST_NODE_TYPES.ReturnStatement && parent.argument === node);
  return isStatement ? parent : undefined;
}

function isAsyncContext(sourceCode: SourceCode, statement: TSESTree.Statement): boolean {
  const owner = ancestorsOf(statement).find(isFunction);
  return owner === undefined ? sourceCode.ast.sourceType === 'module' : owner.async;
}

function awaitsBefore(
  sourceCode: SourceCode,
  body: TSESTree.BlockStatement,
  statement: TSESTree.Statement,
): boolean {
  return body.body
    .slice(0, body.body.indexOf(statement))
    .some((before) =>
      descendants(before, sourceCode.visitorKeys, isFunction).some(
        (node) => node.type === AST_NODE_TYPES.AwaitExpression,
      ),
    );
}

function callbackShape(fn: FunctionNode): TSESTree.CallExpression | undefined {
  const mapCall = fn.parent;
  if (
    mapCall.type !== AST_NODE_TYPES.CallExpression ||
    mapCall.callee.type !== AST_NODE_TYPES.MemberExpression ||
    mapCall.callee.computed ||
    mapCall.callee.property.type !== AST_NODE_TYPES.Identifier ||
    !CALLBACK_METHODS.has(mapCall.callee.property.name) ||
    mapCall.arguments.length !== 1 ||
    fn.type !== AST_NODE_TYPES.ArrowFunctionExpression ||
    !fn.async ||
    fn.params.length !== 1 ||
    fn.body.type !== AST_NODE_TYPES.BlockStatement
  ) {
    return undefined;
  }
  return mapCall;
}

function callbackCall(
  context: Context,
  call: TSESTree.CallExpression,
  fn: FunctionNode,
): LoopCall | undefined {
  const mapCall = callbackShape(fn);
  const [item] = fn.params;
  const { body } = fn;
  const iterable =
    mapCall?.callee.type === AST_NODE_TYPES.MemberExpression ? mapCall.callee.object : undefined;
  const hoistBefore = mapCall === undefined ? undefined : holderOf(mapCall);
  const statement = statementHolding(body, call);
  if (
    iterable === undefined ||
    hoistBefore === undefined ||
    statement === undefined ||
    item?.type !== AST_NODE_TYPES.Identifier ||
    body.type !== AST_NODE_TYPES.BlockStatement ||
    !isStatementIn(hoistBefore) ||
    !isAsyncContext(context.sourceCode, hoistBefore) ||
    touchesIterable(context.sourceCode, iterable, body) ||
    !isArrayOf(context, iterable) ||
    !isItemStable(context, item, { body, target: call }) ||
    !isIterableStable(context, iterable, { body, target: call }) ||
    awaitsBefore(context.sourceCode, body, statement)
  ) {
    return undefined;
  }
  return {
    hoistBefore,
    iterable,
    item,
    body,
    range: fn.range,
    statement,
    sequential: false,
    loop: undefined,
  };
}

export function loopCall(context: Context, call: TSESTree.CallExpression): LoopCall | undefined {
  const found = enclosingLoop(call, context);
  if (found?.loop?.type === AST_NODE_TYPES.ForOfStatement) {
    return forOfCall(context, call, found.loop);
  }
  return found?.callback === undefined ? undefined : callbackCall(context, call, found.callback);
}

export function resultDeclarator(
  loop: LoopCall,
  call: TSESTree.CallExpression,
): TSESTree.VariableDeclarator | undefined {
  const { statement } = loop;
  if (
    statement.type !== AST_NODE_TYPES.VariableDeclaration ||
    statement.declarations.length !== 1
  ) {
    return undefined;
  }
  const [declarator] = statement.declarations;
  const { init } = declarator;
  const awaited = init?.type === AST_NODE_TYPES.AwaitExpression && init.argument === call;
  return declarator.id.type === AST_NODE_TYPES.Identifier && awaited ? declarator : undefined;
}
