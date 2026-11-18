import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../analysis/constant-resolution.mts';
import { memberName, type Context } from '../security/security-values.mts';
import { ancestorsOf, chainOf, nameOf } from '../typed/node-views.mts';
import {
  createOrigins,
  descendants,
  skipped,
  type ClientSpec,
  type Origins,
} from './io-origin.mts';
import type { Invocation } from './origins/origin-types.mts';

type Creation = TSESTree.CallExpression | TSESTree.NewExpression | undefined;
type Scope = { readonly context: Context; readonly originOf: Origins['originOf'] };
type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
export type Bounds = {
  readonly wrapsInFunction: (call: Invocation, fn: TSESTree.Node) => boolean;
  readonly acquiresIn: (fn: FunctionNode) => boolean;
  readonly limiterAt: (callee: TSESTree.Node, root: TSESTree.Node) => boolean;
  readonly isUnboundedPMap: (call: TSESTree.CallExpression) => boolean;
};

const { DefinitionType } = TSESLint.Scope;

const DEFAULT = 'default';
const INFINITE = new Set(['Infinity']);
const LIMITER_NAME = /(?:limit|limiter|queue|sema|semaphore|throttle|throttler|mutex)$/iu;
const PROJECT_MODULE = /^[./]/u;

function isNamedProperty(property: TSESTree.Node, name: string): property is TSESTree.Property {
  return property.type === AST_NODE_TYPES.Property && nameOf(property.key) === name;
}

function hasProperty(object: TSESTree.Node | undefined, name: string): boolean {
  const target = skipped(object);
  const found =
    target?.type === AST_NODE_TYPES.ObjectExpression
      ? target.properties.find((p) => isNamedProperty(p, name))
      : undefined;
  return found !== undefined && !INFINITE.has(nameOf(found.value) ?? '');
}

function hasLimitArgument(creation: Creation): boolean {
  const first = creation?.arguments[0];
  return first !== undefined && !INFINITE.has(nameOf(first) ?? '');
}

function limiter(
  makers: readonly string[],
  valid: (creation: Creation) => boolean,
  types: readonly string[] = [],
): ClientSpec {
  return {
    kind: 'limiter',
    methods: '*',
    callable: false,
    deep: false,
    makers: new Set(makers),
    types: new Set(types),
    functions: new Set<string>(),
    derivers: new Set<string>(),
    valid,
  };
}

const LIMITERS = new Map<string, ClientSpec>([
  ['p-limit', limiter([DEFAULT], hasLimitArgument, ['LimitFunction'])],
  ['p-queue', limiter([DEFAULT], (creation) => hasProperty(creation?.arguments[0], 'concurrency'))],
  [
    'bottleneck',
    limiter([DEFAULT], (creation) => hasProperty(creation?.arguments[0], 'maxConcurrent')),
  ],
  ['p-throttle', limiter([DEFAULT], (creation) => hasProperty(creation?.arguments[0], 'limit'))],
  ['async-sema', limiter(['Sema', 'RateLimit'], hasLimitArgument)],
  ['async-mutex', limiter(['Semaphore', 'Mutex'], () => true)],
  ['p-map', limiter([], () => false)],
  ['limiter', limiter(['RateLimiter'], (creation) => creation?.arguments[0] !== undefined)],
]);

function limiterSpec(source: string): ClientSpec | undefined {
  return LIMITERS.get(source);
}

function isWithin(node: TSESTree.Node, root: TSESTree.Node): boolean {
  return chainOf<TSESTree.Node>(node, (current) => current.parent).includes(root);
}

function isUnboundedPMap(moduleRef: Origins['moduleRef'], call: TSESTree.CallExpression): boolean {
  const callee = skipped(call.callee);
  const ref =
    callee.type === AST_NODE_TYPES.Identifier ? moduleRef(callee, callee.name) : undefined;
  const options = call.arguments[2] === undefined ? undefined : skipped(call.arguments[2]);
  const open =
    options === undefined ||
    (options.type === AST_NODE_TYPES.ObjectExpression &&
      options.properties.every((property) => property.type === AST_NODE_TYPES.Property) &&
      !hasProperty(options, 'concurrency'));
  return ref?.source === 'p-map' && ref.imported === DEFAULT && open;
}

function holderOf(callee: TSESTree.Node): TSESTree.Node {
  const target = skipped(callee);
  if (target.type !== AST_NODE_TYPES.MemberExpression) {
    return target;
  }
  const object = skipped(target.object);
  return object.type === AST_NODE_TYPES.ThisExpression ? target : object;
}

function isThisMember(node: TSESTree.Node): node is TSESTree.MemberExpression {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    skipped(node.object).type === AST_NODE_TYPES.ThisExpression
  );
}

function classBodyOf(node: TSESTree.Node): TSESTree.ClassBody | undefined {
  return ancestorsOf(node).find((ancestor) => ancestor.type === AST_NODE_TYPES.ClassBody);
}

function receivedField(
  member: TSESTree.MemberExpression,
  isParameter: (identifier: TSESTree.Identifier) => boolean,
): boolean {
  const key = memberName(member);
  const body = classBodyOf(member);
  if (body === undefined) {
    return false;
  }
  return [...descendants(body)].some(
    (node) =>
      (node.type === AST_NODE_TYPES.TSParameterProperty && nameOf(node.parameter) === key) ||
      (node.type === AST_NODE_TYPES.AssignmentExpression &&
        isThisMember(node.left) &&
        memberName(node.left) === key &&
        node.right.type === AST_NODE_TYPES.Identifier &&
        isParameter(node.right)),
  );
}

function isParameter(context: SourceContext, identifier: TSESTree.Identifier): boolean {
  const variable = findVariable(context, identifier, identifier.name);
  return variable?.defs.some((definition) => definition.type === DefinitionType.Parameter) === true;
}

function isImportedLimiter(context: SourceContext, identifier: TSESTree.Identifier): boolean {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const source =
    definition?.type === DefinitionType.ImportBinding &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration
      ? definition.parent.source.value
      : '';
  return PROJECT_MODULE.test(source) && LIMITER_NAME.test(identifier.name);
}

function received(context: SourceContext, holder: TSESTree.Node): boolean {
  if (holder.type === AST_NODE_TYPES.Identifier) {
    return isParameter(context, holder) || isImportedLimiter(context, holder);
  }
  return (
    isThisMember(holder) && receivedField(holder, (identifier) => isParameter(context, identifier))
  );
}

function limiterAt(
  { context, originOf }: Scope,
  callee: TSESTree.Node,
  root: TSESTree.Node,
): boolean {
  const holder = holderOf(callee);
  if (received(context, holder)) {
    return true;
  }
  const found = originOf(holder);
  if (found?.instance !== true) {
    return false;
  }
  return (
    found.creation === undefined ||
    (!isWithin(found.creation, root) && found.spec.valid?.(found.creation) === true)
  );
}

function wrapsInFunction(scope: Scope, call: Invocation, fn: TSESTree.Node): boolean {
  const path = chainOf<TSESTree.Node>(call.parent, (current) => current.parent);
  const inside = path.includes(fn) ? path.slice(0, path.indexOf(fn)) : path;
  const start = inside.findIndex((node) => node.type.includes('Function'));
  return (
    start >= 0 &&
    inside
      .slice(start)
      .some(
        (node) => node.type === AST_NODE_TYPES.CallExpression && limiterAt(scope, node.callee, fn),
      )
  );
}

function acquiresIn(scope: Scope, fn: FunctionNode): boolean {
  return [...descendants(fn.body)].some(
    (node) =>
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      ['acquire', 'removeTokens', 'runExclusive'].includes(memberName(node.callee) ?? '') &&
      limiterAt(scope, node.callee, fn),
  );
}

export function createBounds(context: Context): Bounds {
  const { originOf, moduleRef } = createOrigins(context, limiterSpec);
  const scope = { context, originOf };
  return {
    wrapsInFunction: (call, fn) => wrapsInFunction(scope, call, fn),
    acquiresIn: (fn) => acquiresIn(scope, fn),
    limiterAt: (callee, root) => limiterAt(scope, callee, root),
    isUnboundedPMap: (call) => isUnboundedPMap(moduleRef, call),
  };
}
