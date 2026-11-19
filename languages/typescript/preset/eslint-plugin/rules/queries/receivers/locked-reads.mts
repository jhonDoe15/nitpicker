import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName, unwrapped } from '../../security/security-values.mts';
import { chainOf, depthFirst, nodeChildren } from '../../typed/node-views.mts';

const LOCK_METHODS = new Set([
  'setLock',
  'setOnLocked',
  'forUpdate',
  'forShare',
  'forKeyShare',
  'forNoKeyUpdate',
  'lock',
  'skipLocked',
  'noWait',
]);
const LOCK_KEYS = new Set(['lock', 'skipLocked', 'onLocked']);
const LOCK_CLAUSE =
  /\bFOR\s+(?:UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b|\bLOCK\s+IN\s+SHARE\s+MODE\b/iu;

function callsOf(call: TSESTree.CallExpression): TSESTree.CallExpression[] {
  const links = chainOf<TSESTree.Node>(call, (current) => {
    if (current.type === AST_NODE_TYPES.CallExpression) {
      return unwrapped(current.callee);
    }
    return current.type === AST_NODE_TYPES.MemberExpression ? unwrapped(current.object) : undefined;
  });
  return links.filter((link) => link.type === AST_NODE_TYPES.CallExpression);
}

function isLockMethod(call: TSESTree.CallExpression): boolean {
  const callee = unwrapped(call.callee);
  const method = callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
  return method !== undefined && LOCK_METHODS.has(method);
}

function hasLockKey(argument: TSESTree.Node): boolean {
  const options = unwrapped(argument);
  return (
    options.type === AST_NODE_TYPES.ObjectExpression &&
    options.properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.Property &&
        !property.computed &&
        property.key.type === AST_NODE_TYPES.Identifier &&
        LOCK_KEYS.has(property.key.name),
    )
  );
}

function textsOf(argument: TSESTree.Node): string[] {
  return [...depthFirst<TSESTree.Node>(argument, nodeChildren)].flatMap((node) => {
    if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
      return [node.value];
    }
    return node.type === AST_NODE_TYPES.TemplateElement ? [node.value.raw] : [];
  });
}

function hasLockClause(argument: TSESTree.Node): boolean {
  return textsOf(argument).some((text) => LOCK_CLAUSE.test(text));
}

export function isLockedRead(call: TSESTree.CallExpression): boolean {
  return callsOf(call).some(
    (each) =>
      isLockMethod(each) ||
      each.arguments.some((argument) => hasLockKey(argument) || hasLockClause(argument)),
  );
}
