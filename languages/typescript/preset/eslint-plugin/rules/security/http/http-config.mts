import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ts } from '../../typed/typescript-views.mts';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  resolveFunction,
  stringValue,
} from '../../analysis/constant-resolution.mts';
import {
  leafValues,
  memberName,
  propertyNamed,
  typeServices,
  unwrapped,
  type Context,
} from '../security-values.mts';

const MISSING = 'missing';
const UNKNOWN = 'unknown';

export type ConfigState = typeof MISSING | 'set' | typeof UNKNOWN | 'url';

const NO_VALUE = new Set(['undefined', 'null']);
const CALLBACK_NAME = /^(?:resolve|reject|cb|callback|done|next|listener|on[A-Z]\w*|handle\w*)$/u;
const LOCAL_URL = /^(?:data|blob):/iu;
const LOCAL_URL_NAME = /^(?:data|blob|object)(?:Url|Uri|URL|URI)$/u;

export function isAbsent(context: Context, node: TSESTree.Node | undefined): boolean {
  const leaves = leafValues(context, node);
  return leaves.every(
    (leaf) =>
      (leaf.type === AST_NODE_TYPES.Identifier && NO_VALUE.has(leaf.name)) ||
      (leaf.type === AST_NODE_TYPES.Literal &&
        (leaf.value === null || leaf.value === 0 || leaf.value === false)),
  );
}

function isUrlType(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const type = services.getTypeAtLocation(node);
  return (type.flags & ts.TypeFlags.StringLike) !== 0 || type.getSymbol()?.name === 'URL';
}

export function typeNamed(context: Context, node: TSESTree.Node, name: string): boolean {
  const services = typeServices(context);
  return services !== undefined && services.getTypeAtLocation(node).getSymbol()?.getName() === name;
}

function hasCallSignature(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  return services !== undefined && services.getTypeAtLocation(node).getCallSignatures().length > 0;
}

export function isCallback(
  context: Context,
  args: readonly TSESTree.Node[],
  index: number,
): boolean {
  const argument = unwrapped(args[index]);
  if (isFunctionNode(argument) || resolveFunction(context, argument) !== undefined) {
    return true;
  }
  if (
    index === 0 ||
    (argument?.type !== AST_NODE_TYPES.Identifier &&
      argument?.type !== AST_NODE_TYPES.MemberExpression)
  ) {
    return false;
  }
  const previous = unwrapped(resolveConstant(context, unwrapped(args[index - 1])));
  const afterOptions = previous?.type === AST_NODE_TYPES.ObjectExpression;
  const named = argument.type === AST_NODE_TYPES.Identifier && CALLBACK_NAME.test(argument.name);
  return afterOptions || named || hasCallSignature(context, argument);
}

export function isLocalUrl(context: Context, node: TSESTree.Node | undefined): boolean {
  const target = unwrapped(resolveConstant(context, unwrapped(node)));
  if (target === undefined) {
    return false;
  }
  const text =
    stringValue(target) ??
    (target.type === AST_NODE_TYPES.TemplateLiteral
      ? (target.quasis[0]?.value.cooked ?? undefined)
      : undefined);
  if (text !== undefined) {
    return LOCAL_URL.test(text);
  }
  if (target.type === AST_NODE_TYPES.Identifier) {
    return LOCAL_URL_NAME.test(target.name);
  }
  const base =
    target.type === AST_NODE_TYPES.NewExpression ? unwrapped(target.arguments[1]) : undefined;
  const isMetaUrl =
    base?.type === AST_NODE_TYPES.MemberExpression &&
    base.object.type === AST_NODE_TYPES.MetaProperty &&
    memberName(base) === 'url';
  const isObjectUrl =
    target.type === AST_NODE_TYPES.CallExpression &&
    target.callee.type === AST_NODE_TYPES.MemberExpression &&
    memberName(target.callee) === 'createObjectURL';
  return isMetaUrl || isObjectUrl;
}

function laterWrites(
  context: Context,
  node: TSESTree.Node,
  keys: readonly string[],
): ConfigState | undefined {
  const identifier = unwrapped(node);
  if (identifier.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const variable = findVariable(context, identifier, identifier.name);
  const states = (variable?.references ?? []).map((reference): ConfigState | undefined => {
    const owner = reference.identifier.parent;
    const write =
      owner.type === AST_NODE_TYPES.MemberExpression &&
      owner.object === reference.identifier &&
      owner.parent.type === AST_NODE_TYPES.AssignmentExpression &&
      owner.parent.left === owner &&
      keys.some((key) => key === memberName(owner))
        ? owner.parent
        : undefined;
    if (write !== undefined) {
      return isAbsent(context, write.right) ? MISSING : 'set';
    }
    const assigned =
      owner.type === AST_NODE_TYPES.CallExpression &&
      owner.arguments[0] === reference.identifier &&
      owner.callee.type === AST_NODE_TYPES.MemberExpression &&
      memberName(owner.callee) === 'assign';
    return assigned ? UNKNOWN : undefined;
  });
  return states.find((state) => state === 'set') ?? states.find((state) => state === UNKNOWN);
}

function objectState(
  context: Context,
  resolved: TSESTree.ObjectExpression,
  keys: readonly string[],
): ConfigState {
  for (const key of keys) {
    const value = propertyNamed(context, resolved, key);
    if (value !== undefined) {
      return isAbsent(context, value) ? MISSING : 'set';
    }
  }
  const spreads = resolved.properties.filter(
    (entry) => entry.type === AST_NODE_TYPES.SpreadElement,
  );
  const resolvable = spreads.every(
    (entry) =>
      unwrapped(resolveConstant(context, unwrapped(entry.argument)))?.type ===
      AST_NODE_TYPES.ObjectExpression,
  );
  return resolvable ? MISSING : UNKNOWN;
}

export function configState(
  context: Context,
  node: TSESTree.Node | undefined,
  keys: readonly string[],
): ConfigState {
  if (node === undefined) {
    return MISSING;
  }
  const resolved = unwrapped(resolveConstant(context, unwrapped(node)));
  if (
    resolved?.type === AST_NODE_TYPES.Literal ||
    resolved?.type === AST_NODE_TYPES.TemplateLiteral ||
    isUrlType(context, node)
  ) {
    return 'url';
  }
  if (resolved?.type !== AST_NODE_TYPES.ObjectExpression) {
    return isAbsent(context, resolved) ? MISSING : UNKNOWN;
  }
  const state = objectState(context, resolved, keys);
  return state === 'set' ? state : (laterWrites(context, node, keys) ?? state);
}

export function lacksTimeout(
  context: Context,
  nodes: readonly (TSESTree.Node | undefined)[],
  keys: readonly string[],
): boolean {
  const states = nodes.map((node) => configState(context, node, keys));
  return !(states.includes('set') || states.includes(UNKNOWN));
}

export function configNodes(
  context: Context,
  args: readonly TSESTree.Node[],
): (TSESTree.Node | undefined)[] {
  const object = args
    .slice(0, 2)
    .find(
      (argument) =>
        unwrapped(resolveConstant(context, unwrapped(argument)))?.type ===
        AST_NODE_TYPES.ObjectExpression,
    );
  return object === undefined ? [args[1]] : [object];
}
