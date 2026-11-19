import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { importedBindings } from '../../security/imported-names.mts';
import type { Context } from '../../security/security-values.mts';
import { unwrapped } from '../../secrets/secret-nodes.mts';
import { isCachePackage } from '../../support/io/packages.mts';
import { rootNode } from '../../support/orm/chains.mts';
import { ancestorsOf, nameOf } from '../../typed/node-views.mts';

export type CacheKind = 'client' | 'local';

const LOCAL_TYPES = new Set(['Map', 'WeakMap', 'Set', 'WeakSet']);
const CACHE_WORDS = new Set(['cache', 'redis', 'keyv', 'memcache', 'memcached']);
const CLIENT_LAST_WORDS = new Set([...CACHE_WORDS, 'client', 'manager', 'store', 'service']);
const CLIENT_WRITES = new Set([
  'set',
  'setex',
  'psetex',
  'setnx',
  'del',
  'unlink',
  'hset',
  'hmset',
  'hdel',
  'mset',
  'mdel',
  'expire',
  'pexpire',
  'incr',
  'incrby',
  'decr',
  'decrby',
  'sadd',
  'srem',
  'lpush',
  'rpush',
  'zadd',
  'zrem',
  'reset',
  'clear',
]);
const MAX_DEPTH = 4;

function localTypeOf(node: TSESTree.Node | undefined): boolean {
  if (node?.type === undefined) {
    return false;
  }
  const inner = unwrapped(
    node.type === AST_NODE_TYPES.TSTypeAnnotation ? node.typeAnnotation : node,
  );
  if (inner.type === AST_NODE_TYPES.NewExpression) {
    return LOCAL_TYPES.has(nameOf(inner.callee) ?? '');
  }
  return (
    inner.type === AST_NODE_TYPES.TSTypeReference && LOCAL_TYPES.has(nameOf(inner.typeName) ?? '')
  );
}

function declaresLocal(member: TSESTree.ClassElement, name: string): boolean {
  if (member.type === AST_NODE_TYPES.PropertyDefinition) {
    return (
      nameOf(member.key) === name &&
      (localTypeOf(member.value ?? undefined) || localTypeOf(member.typeAnnotation))
    );
  }
  const body = member.type === AST_NODE_TYPES.MethodDefinition ? member.value : undefined;
  return (
    body !== undefined &&
    body.params.some(
      (param) =>
        param.type === AST_NODE_TYPES.TSParameterProperty &&
        nameOf(param.parameter) === name &&
        param.parameter.type === AST_NODE_TYPES.Identifier &&
        localTypeOf(param.parameter.typeAnnotation),
    )
  );
}

function isLocalMember(owner: TSESTree.MemberExpression): boolean {
  const classBody = ancestorsOf(owner).find((node) => node.type === AST_NODE_TYPES.ClassBody);
  const name = nameOf(owner.property);
  return (
    classBody?.type === AST_NODE_TYPES.ClassBody &&
    name !== undefined &&
    classBody.body.some((member) => declaresLocal(member, name))
  );
}

function isLocalVariable(owner: TSESTree.Identifier, context: Context): boolean {
  const definition = findVariable(context, owner, owner.name)?.defs[0];
  if (definition === undefined) {
    return false;
  }
  const { node } = definition;
  if (node.type === AST_NODE_TYPES.VariableDeclarator) {
    return localTypeOf(node.init ?? undefined) || localTypeOf(node.id.typeAnnotation);
  }
  return node.type === AST_NODE_TYPES.Identifier && localTypeOf(node.typeAnnotation);
}

function isLocalOwner(owner: TSESTree.Node, context: Context): boolean {
  if (owner.type === AST_NODE_TYPES.MemberExpression) {
    return owner.object.type === AST_NODE_TYPES.ThisExpression && isLocalMember(owner);
  }
  return owner.type === AST_NODE_TYPES.Identifier && isLocalVariable(owner, context);
}

function originRoot(init: TSESTree.Node): TSESTree.Node | undefined {
  const inner = unwrapped(init);
  const value = inner.type === AST_NODE_TYPES.AwaitExpression ? unwrapped(inner.argument) : inner;
  return value.type === AST_NODE_TYPES.NewExpression ? unwrapped(value.callee) : rootNode(value);
}

function isClientVariable(root: TSESTree.Identifier, context: Context): boolean {
  const bindings = importedBindings(context.sourceCode.ast);
  const pending: TSESTree.Identifier[] = [root];
  for (const current of pending) {
    if (isCachePackage(bindings.get(current.name)?.module ?? '')) {
      return true;
    }
    const definition = findVariable(context, current, current.name)?.defs[0];
    const declarator =
      definition?.node.type === AST_NODE_TYPES.VariableDeclarator ? definition.node : undefined;
    const init = declarator?.init ?? undefined;
    const next = init === undefined ? undefined : originRoot(init);
    if (next?.type === AST_NODE_TYPES.Identifier && pending.length <= MAX_DEPTH) {
      pending.push(next);
    }
  }
  return false;
}

function ownerName(owner: TSESTree.Node): string {
  return nameOf(owner.type === AST_NODE_TYPES.MemberExpression ? owner.property : owner) ?? '';
}

function isCacheName(name: string): boolean {
  const words = name
    .replaceAll(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u);
  const last = words.at(-1) ?? '';
  return CLIENT_LAST_WORDS.has(last) && words.some((word) => CACHE_WORDS.has(word));
}

function isClient(owner: TSESTree.Node, context: Context): boolean {
  const root = rootNode(owner);
  const imported = root?.type === AST_NODE_TYPES.Identifier && isClientVariable(root, context);
  return imported || isCacheName(ownerName(owner));
}

export function cacheKindOf(
  call: TSESTree.CallExpression,
  context: Context,
): { readonly kind: CacheKind; readonly method: string } | undefined {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  const method = nameOf(callee.property) ?? '';
  const owner = unwrapped(callee.object);
  if (isLocalOwner(owner, context)) {
    return method === 'set' ? { kind: 'local', method } : undefined;
  }
  const clientMethod =
    CLIENT_WRITES.has(method) || (method === 'delete' && isCacheName(ownerName(owner)));
  return clientMethod && isClient(owner, context) ? { kind: 'client', method } : undefined;
}
