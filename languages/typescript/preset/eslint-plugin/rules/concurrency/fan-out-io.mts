import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode, resolveFunction } from '../analysis/constant-resolution.mts';
import { isGlobalFetch } from '../security/http/http-modules.mts';
import { memberName, type Context } from '../security/security-values.mts';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';
import { clientSpec } from './client-modules.mts';
import {
  createOrigins,
  skipped,
  type ClientSpec,
  type Origin,
  type Origins,
} from './io-origin.mts';
import type { Invocation } from './origins/origin-types.mts';

type Kind = ClientSpec['kind'];
type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
type Scope = { readonly context: Context; readonly originOf: Origins['originOf'] };
export type Io = {
  readonly ioKind: (call: Invocation) => Kind | undefined;
  readonly helperOf: (call: Invocation) => FunctionNode | undefined;
};

function memberKind(base: Origin | undefined, name: string | undefined): Kind | undefined {
  if (base === undefined || name === undefined) {
    return undefined;
  }
  const { spec } = base;
  if (base.instance) {
    return spec.methods === '*' || spec.methods.has(name) ? spec.kind : undefined;
  }
  const callsModule =
    base.member === undefined &&
    ((spec.methods !== '*' && spec.methods.has(name)) ||
      spec.functions.has(name) ||
      (name === 'default' && spec.callable));
  return callsModule ? spec.kind : undefined;
}

function identifierKind(ref: Origin | undefined): Kind | undefined {
  if (ref === undefined || ref.instance) {
    return undefined;
  }
  const { spec } = ref;
  const named = ref.imported !== undefined && spec.functions.has(ref.imported);
  return named || (ref.imported === 'default' && spec.callable) ? spec.kind : undefined;
}

function ioKind(call: Invocation, { context, originOf }: Scope): Kind | undefined {
  const callee = skipped(call.callee);
  if (
    callee.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    callee.type === AST_NODE_TYPES.FunctionExpression
  ) {
    return undefined;
  }
  if (isGlobalFetch(context, callee)) {
    return 'remote';
  }
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return identifierKind(originOf(callee));
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  return memberKind(originOf(callee.object), memberName(callee));
}

function methodOf(callee: TSESTree.Node): TSESTree.MethodDefinition['value'] | undefined {
  const member = skipped(callee);
  const isThisCall =
    member.type === AST_NODE_TYPES.MemberExpression &&
    member.object.type === AST_NODE_TYPES.ThisExpression;
  if (!isThisCall) {
    return undefined;
  }
  const current = ancestorsOf(member).find((node) => node.type === AST_NODE_TYPES.ClassBody);
  const found = current?.body.find(
    (entry): entry is TSESTree.MethodDefinition =>
      entry.type === AST_NODE_TYPES.MethodDefinition && nameOf(entry.key) === memberName(member),
  );
  return found?.value;
}

function helperOf(call: Invocation, context: Context): FunctionNode | undefined {
  const callee = skipped(call.callee);
  const helper = resolveFunction(context, callee) ?? methodOf(callee);
  return isFunctionNode(helper) ? helper : undefined;
}

export function createIo(context: Context): Io {
  const { originOf } = createOrigins(context, clientSpec);
  return {
    ioKind: (call) => ioKind(call, { context, originOf }),
    helperOf: (call) => helperOf(call, context),
  };
}
