import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, stringValue } from '../../analysis/constant-resolution.mts';
import { unwrapped as unwrap, type Context } from '../../security/security-values.mts';
import { STRUCTURED_HEADERS, VALUE_HEADERS } from './header-tables.mts';
import { isGetterOwner, isHeaderBag, isRequestLike } from './receivers.mts';

export type HttpMessageId =
  'valueCase' | 'nameCase' | 'handSplit' | 'cookiePrefix' | 'urlCase' | 'extensionCase';
export type Finding = TSESLint.ReportDescriptor<HttpMessageId>;
export type Origin =
  { readonly kind: 'header'; readonly header: string } | { readonly kind: 'extension' };
type MaybeNode = TSESTree.Node | undefined;
type Step = { readonly next: MaybeNode } | { readonly found: Origin } | undefined;

const { DefinitionType } = TSESLint.Scope;
const KEEPING_METHODS = new Set(['trim', 'trimStart', 'trimEnd', 'toString', 'valueOf']);
const EXTENSION_SPLIT = new Set(['pop', 'at']);
const MAX_DEPTH = 4;
const DOT_HEADERS = new Set([
  'accept',
  'authorization',
  'connection',
  'cookie',
  'expect',
  'forwarded',
  'host',
  'origin',
  'pragma',
  'te',
  'upgrade',
  'vary',
]);

export { unwrap };

export function nameOf(node: MaybeNode): string | undefined {
  const target = unwrap(node);
  if (target?.type === AST_NODE_TYPES.Identifier) {
    return target.name;
  }
  if (target?.type === AST_NODE_TYPES.MemberExpression && !target.computed) {
    return target.property.type === AST_NODE_TYPES.Identifier ? target.property.name : undefined;
  }
  return undefined;
}

function memberKey(member: TSESTree.MemberExpression): string | undefined {
  return member.computed ? stringValue(member.property) : nameOf(member);
}

function isBag(context: Context, node: TSESTree.Node): boolean {
  const target = unwrap(node);
  if (target.type === AST_NODE_TYPES.NewExpression) {
    return nameOf(target.callee) === 'Headers';
  }
  return isHeaderBag(context, target, nameOf(target));
}

export function requestLike(context: Context, node: TSESTree.Node): boolean {
  return isRequestLike(context, node, nameOf(node));
}

function headerGetter(context: Context, call: TSESTree.CallExpression): string | undefined {
  const callee = unwrap(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  const method = nameOf(callee);
  const owner = unwrap(callee.object);
  const getsFromBag = method === 'get' && isBag(context, owner);
  const named = method === 'header' || method === 'getHeader';
  const getsFromRequest =
    (named && requestLike(context, owner)) ||
    (method === 'get' && isGetterOwner(context, owner, nameOf(owner)));
  return getsFromBag || getsFromRequest ? stringValue(call.arguments[0])?.toLowerCase() : undefined;
}

function headerMember(context: Context, member: TSESTree.MemberExpression): string | undefined {
  const key = isBag(context, member.object) ? memberKey(member) : undefined;
  return key !== undefined && (member.computed || DOT_HEADERS.has(key))
    ? key.toLowerCase()
    : undefined;
}

function isSplitOnDot(node: MaybeNode): boolean {
  const call = unwrap(node);
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    nameOf(call.callee) === 'split' &&
    stringValue(call.arguments[0]) === '.'
  );
}

function usesLastDot(node: MaybeNode): boolean {
  const pending = [unwrap(node)];
  for (const target of pending) {
    if (target?.type === AST_NODE_TYPES.BinaryExpression) {
      pending.push(unwrap(target.left), unwrap(target.right));
    }
  }
  return pending.some(
    (target) =>
      target?.type === AST_NODE_TYPES.CallExpression && nameOf(target.callee) === 'lastIndexOf',
  );
}

function extensionOf(node: MaybeNode): boolean {
  const call = unwrap(node);
  if (call?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const method = nameOf(call.callee);
  if (method === 'extname') {
    return true;
  }
  const callee = unwrap(call.callee);
  const afterLastDot = ['slice', 'substring', 'substr'].includes(method ?? '');
  return (
    (EXTENSION_SPLIT.has(method ?? '') &&
      callee.type === AST_NODE_TYPES.MemberExpression &&
      isSplitOnDot(callee.object)) ||
    (afterLastDot && usesLastDot(call.arguments[0]))
  );
}

function resolvedInit(context: Context, identifier: TSESTree.Identifier): MaybeNode {
  const variable = findVariable(context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  const writes = variable?.references.filter((reference) => reference.isWrite()) ?? [];
  const sameFunction =
    variable !== undefined &&
    variable.scope.variableScope === context.sourceCode.getScope(identifier).variableScope;
  return definition?.type === DefinitionType.Variable &&
    definition.node.id.type === AST_NODE_TYPES.Identifier &&
    writes.length === 1 &&
    sameFunction
    ? (definition.node.init ?? undefined)
    : undefined;
}

export function initOf(context: Context, node: MaybeNode): MaybeNode {
  const target = unwrap(node);
  return target?.type === AST_NODE_TYPES.Identifier
    ? unwrap(resolvedInit(context, target))
    : undefined;
}

function callStep(context: Context, call: TSESTree.CallExpression): Step {
  const callee = unwrap(call.callee);
  if (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'String') {
    return { next: call.arguments[0] };
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    KEEPING_METHODS.has(nameOf(callee) ?? '')
  ) {
    return { next: callee.object };
  }
  if (extensionOf(call)) {
    return { found: { kind: 'extension' } };
  }
  const header = headerGetter(context, call);
  return header === undefined ? undefined : { found: { kind: 'header', header } };
}

function originStep(context: Context, node: MaybeNode): Step {
  const target = unwrap(node);
  if (target?.type === AST_NODE_TYPES.LogicalExpression) {
    return ['??', '||'].includes(target.operator) ? { next: target.left } : undefined;
  }
  if (target?.type === AST_NODE_TYPES.Identifier) {
    const init = resolvedInit(context, target);
    return init === undefined ? undefined : { next: init };
  }
  if (target?.type === AST_NODE_TYPES.MemberExpression) {
    const header = headerMember(context, target);
    return header === undefined ? undefined : { found: { kind: 'header', header } };
  }
  return target?.type === AST_NODE_TYPES.CallExpression ? callStep(context, target) : undefined;
}

export function originOf(context: Context, node: MaybeNode): Origin | undefined {
  const pending = [node];
  for (const current of pending) {
    const step = originStep(context, current);
    if (step === undefined || pending.length > MAX_DEPTH) {
      return undefined;
    }
    if ('found' in step) {
      return step.found;
    }
    pending.push(step.next);
  }
  return undefined;
}

export function isCaseInsensitiveValue(origin: Origin | undefined): origin is Origin & {
  readonly kind: 'header';
} {
  return origin?.kind === 'header' && VALUE_HEADERS.test(origin.header);
}

export function isStructuredValue(origin: Origin | undefined): origin is Origin & {
  readonly kind: 'header';
} {
  return origin?.kind === 'header' && STRUCTURED_HEADERS.test(origin.header);
}
