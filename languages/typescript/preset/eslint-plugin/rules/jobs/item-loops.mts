import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { callsWithin } from '../effects/held-scopes.mts';
import type { LoopNode } from '../loops/loop-shapes.mts';
import type { Context } from '../security/security-values.mts';
import { isEstreeConsumed } from '../support/flow/consumed.mts';
import { callEffects } from '../support/io-effects.mts';
import { ancestorsOf, contains, isNode, nameOf } from '../typed/node-views.mts';
import { isCallback } from '../typed/syntax-views.mts';

type Call = TSESTree.CallExpression | TSESTree.TaggedTemplateExpression;
type Work = { readonly call: Call; readonly path: readonly string[] };

const ITEM_IO = ['database', 'remote'];

export function itemWork(loop: LoopNode, context: Context): Work[] {
  const { visitorKeys } = context.sourceCode;
  return callsWithin(loop.body, visitorKeys)
    .filter((call) => call.type === AST_NODE_TYPES.CallExpression && isEstreeConsumed(call))
    .flatMap((call) => {
      const effects = callEffects(call, context);
      const kind = ITEM_IO.find((each) => effects.has(each));
      const path = kind === undefined ? undefined : effects.get(kind);
      return path === undefined ? [] : [{ call, path }];
    });
}

function rethrows(handler: TSESTree.Node): boolean {
  const body: unknown = 'body' in handler ? handler.body : undefined;
  const statements: unknown[] =
    isNode(body) && body.type === AST_NODE_TYPES.BlockStatement ? body.body : [body];
  return statements.some(
    (statement) => isNode(statement) && statement.type === AST_NODE_TYPES.ThrowStatement,
  );
}

function catchHandler(call: Call): TSESTree.Node | undefined {
  const member = call.parent;
  const outer = member.type === AST_NODE_TYPES.MemberExpression ? member.parent : undefined;
  const method =
    member.type === AST_NODE_TYPES.MemberExpression ? nameOf(member.property) : undefined;
  if (outer?.type !== AST_NODE_TYPES.CallExpression || outer.callee !== member) {
    return undefined;
  }
  if (method === 'catch') {
    return outer.arguments[0];
  }
  return method === 'then' ? outer.arguments[1] : undefined;
}

function catchesPerItem(call: Call): boolean {
  const handler = catchHandler(call);
  return handler !== undefined && !(isCallback(handler) && rethrows(handler));
}

function inTryWithCatch(call: Call, loop: LoopNode): boolean {
  return ancestorsOf(call)
    .filter((ancestor) => contains(loop.body, ancestor))
    .some(
      (ancestor) =>
        ancestor.type === AST_NODE_TYPES.TryStatement &&
        ancestor.handler !== null &&
        contains(ancestor.block, call) &&
        !rethrows(ancestor.handler),
    );
}

export function isIsolated(call: Call, loop: LoopNode): boolean {
  return catchesPerItem(call) || inTryWithCatch(call, loop);
}

export function settlesAll(loop: LoopNode, context: Context): boolean {
  return callsWithin(loop.body, context.sourceCode.visitorKeys).some(
    (call) =>
      call.type === AST_NODE_TYPES.CallExpression &&
      call.callee.type === AST_NODE_TYPES.MemberExpression &&
      nameOf(call.callee.object) === 'Promise' &&
      nameOf(call.callee.property) === 'allSettled',
  );
}
