import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { calleeProperty } from '../../lifecycles/shared/scopes.mts';
import {
  boundedReceiver,
  isReleaseHandleAt,
} from '../../lifecycles/subscriptions/subscription-handles.mts';
import type { SourceCode } from '../../typed/node-views.mts';
import { declaredHandle } from '../effects/effect-resources.mts';

const SUBSCRIBING =
  /^(on(?:[A-Z_]|$)|subscribe|listen|watch|observe|autorun|addListener|addEventListener|register(?:[A-Z]|$))/u;
const ONE_SHOT = /^once/iu;
const RELEASER_SET = new Set<string>(['dispose', 'unsubscribe', 'close', 'disconnect']);
const ESCAPE_PARENTS = new Set<string>([
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.Property,
  AST_NODE_TYPES.VariableDeclarator,
]);

export function isSubscribingName(call: TSESTree.CallExpression): boolean {
  const name = calleeProperty(call);
  return name !== undefined && SUBSCRIBING.test(name);
}

function isOneShotCall(call: TSESTree.CallExpression): boolean {
  const name = calleeProperty(call);
  return name !== undefined && ONE_SHOT.test(name);
}

export function isEffectReleaseType(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
  allowFunctionHandle: boolean,
): boolean {
  return isReleaseHandleAt(checker, node, allowFunctionHandle);
}

type ReferenceId = TSESTree.Identifier | TSESTree.JSXIdentifier;

function isReleaserMember(parent: TSESTree.MemberExpression, id: ReferenceId): boolean {
  return (
    parent.object === id &&
    (parent.computed ||
      (parent.property.type === AST_NODE_TYPES.Identifier &&
        RELEASER_SET.has(parent.property.name)))
  );
}

function isHandledReference(id: ReferenceId): boolean {
  const { parent } = id;
  if (parent.type === AST_NODE_TYPES.CallExpression) {
    return parent.callee === id || parent.arguments.some((argument) => argument === id);
  }
  if (parent.type === AST_NODE_TYPES.NewExpression) {
    return parent.arguments.some((argument) => argument === id);
  }
  if (parent.type === AST_NODE_TYPES.MemberExpression) {
    return isReleaserMember(parent, id);
  }
  if (parent.type === AST_NODE_TYPES.ReturnStatement) {
    return parent.argument === id;
  }
  if (parent.type === AST_NODE_TYPES.AssignmentExpression) {
    return parent.right === id;
  }
  return ESCAPE_PARENTS.has(parent.type);
}

function isDroppedOrUnused(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  const outer = call.parent.type === AST_NODE_TYPES.ChainExpression ? call.parent : call;
  if (outer.parent.type === AST_NODE_TYPES.ExpressionStatement) {
    return true;
  }
  const handle = declaredHandle(sourceCode, outer);
  return (
    handle !== undefined &&
    !handle.references
      .filter((reference) => !reference.init)
      .some((reference) => isHandledReference(reference.identifier))
  );
}

export function isCandidateEffectCall(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): boolean {
  return (
    !isOneShotCall(call) &&
    !boundedReceiver(sourceCode, call) &&
    isDroppedOrUnused(sourceCode, call)
  );
}
