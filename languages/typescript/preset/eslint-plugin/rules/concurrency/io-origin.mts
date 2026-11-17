import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';
import { ancestorsOf, depthFirst, nameOf, nodeChildren } from '../typed/node-views.mts';
import {
  annotationOf,
  moduleBindingsOf,
  moduleRef,
  typeImportsOf,
  typeName,
} from './origins/module-refs.mts';
import type {
  ClientSpec,
  CreationNode,
  Env,
  Goal,
  InstanceOrigin,
  Link,
  MaybeOrigin,
  Origins,
  Ref,
  SpecOf,
} from './origins/origin-types.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

export type { ClientSpec, Origin, Origins } from './origins/origin-types.mts';

const { DefinitionType } = TSESLint.Scope;

const MAX_DEPTH = 6;

export function skipped(node: TSESTree.Node): TSESTree.Node;
export function skipped(node: TSESTree.Node | undefined): TSESTree.Node | undefined;
export function skipped(node: TSESTree.Node | undefined): TSESTree.Node | undefined {
  const chain = [unwrapped(node)];
  for (const current of chain) {
    if (current?.type === AST_NODE_TYPES.AwaitExpression) {
      chain.push(unwrapped(current.argument));
    }
  }
  return chain.at(-1);
}

export function descendants(root: TSESTree.Node): Iterable<TSESTree.Node> {
  return depthFirst(root, nodeChildren);
}

function matchesMaker(spec: ClientSpec, name: string | undefined): boolean {
  return name !== undefined && (spec.makers.has(name) || spec.makerPattern?.test(name) === true);
}

function matchesType(spec: ClientSpec, name: string | undefined): boolean {
  return (
    name !== undefined &&
    (spec.makers.has(name) || spec.types.has(name) || spec.typePattern?.test(name) === true)
  );
}

function instance(spec: ClientSpec, ref: Ref, creation: CreationNode | undefined): InstanceOrigin {
  return { source: ref.source, spec, instance: true, creation };
}

function typeOrigin(env: Env, annotation: TSESTree.TSTypeAnnotation | undefined): MaybeOrigin {
  const type = typeName(annotation);
  const ref = type === undefined ? undefined : env.typeImports.get(type.owner ?? type.name ?? '');
  const spec = ref === undefined ? undefined : env.clientSpec(ref.source);
  const wantedName = type?.owner === undefined ? ref?.imported : type.name;
  return ref !== undefined && spec !== undefined && matchesType(spec, wantedName)
    ? instance(spec, ref, undefined)
    : undefined;
}

function parameterOrigin(env: Env, name: TSESTree.Node): MaybeOrigin {
  const parameter = name.type === AST_NODE_TYPES.AssignmentPattern ? name.left : name;
  const typed =
    name.type === AST_NODE_TYPES.Identifier || name.type === AST_NODE_TYPES.AssignmentPattern;
  return typeOrigin(env, typed ? annotationOf(parameter) : undefined);
}

function madeBy(
  env: Env,
  site: { readonly target: TSESTree.Node; readonly call: CreationNode },
  base: MaybeOrigin,
): MaybeOrigin {
  const { target, call } = site;
  if (base?.instance === true) {
    const name = target.type === AST_NODE_TYPES.MemberExpression ? memberName(target) : undefined;
    return name !== undefined && base.spec.derivers.has(name) ? base : undefined;
  }
  const isIdentifier = target.type === AST_NODE_TYPES.Identifier;
  const ref = isIdentifier ? moduleRef(env, target, target.name) : base;
  const member = target.type === AST_NODE_TYPES.MemberExpression ? memberName(target) : undefined;
  const name = isIdentifier ? ref?.imported : member;
  const spec = ref === undefined ? undefined : env.clientSpec(ref.source);
  const isDefault = ref?.imported === 'default' && isIdentifier;
  return ref !== undefined &&
    spec !== undefined &&
    (matchesMaker(spec, name) || (isDefault && spec.makers.has('default')))
    ? instance(spec, ref, call)
    : undefined;
}

function memberOf(base: MaybeOrigin, member: TSESTree.MemberExpression): MaybeOrigin {
  if (base?.instance === false) {
    return { ...base, member: memberName(member) };
  }
  return base?.spec.deep === true ? base : undefined;
}

function sameValue(value: MaybeOrigin): MaybeOrigin {
  return value;
}

function firstValue(values: MaybeOrigin[]): MaybeOrigin {
  return values[0];
}

function goalFor(
  parent: { readonly depth: number },
  node: TSESTree.Node | undefined,
  value: MaybeOrigin,
): Goal {
  return { node, depth: parent.depth + 1, value, children: [], combine: firstValue };
}

function follow(pending: Goal[], goal: Goal, link: Link): void {
  const next = goalFor(goal, link.node, undefined);
  pending.push(next);
  goal.children = [next];
  goal.combine = ([value]) => link.combine(value);
}

type Frame = { readonly env: Env; readonly pending: Goal[]; readonly goal: Goal };

function expandIdentifier({ env, pending, goal }: Frame, identifier: TSESTree.Identifier): void {
  const ref = moduleRef(env, identifier, identifier.name);
  if (ref !== undefined) {
    const spec = env.clientSpec(ref.source);
    goal.value = spec === undefined ? undefined : { ...ref, spec };
    return;
  }
  const variable = findVariable(env.context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (definition?.type === DefinitionType.Parameter) {
    goal.value = parameterOrigin(env, definition.name);
  } else if (
    definition?.type === DefinitionType.Variable &&
    definition.node.id.type === AST_NODE_TYPES.Identifier
  ) {
    goal.value = typeOrigin(env, definition.node.id.typeAnnotation);
    if (goal.value === undefined) {
      follow(pending, goal, { node: definition.node.init ?? undefined, combine: sameValue });
    }
  }
}

type Candidate = { readonly value: MaybeOrigin; readonly next: TSESTree.Node | undefined };

function fieldCandidate(env: Env, node: TSESTree.Node, key: string): Candidate | undefined {
  if (
    node.type === AST_NODE_TYPES.PropertyDefinition &&
    !node.computed &&
    nameOf(node.key) === key
  ) {
    return { value: typeOrigin(env, node.typeAnnotation), next: node.value ?? undefined };
  }
  if (node.type === AST_NODE_TYPES.TSParameterProperty && nameOf(node.parameter) === key) {
    return { value: parameterOrigin(env, node.parameter), next: undefined };
  }
  const assigns =
    node.type === AST_NODE_TYPES.AssignmentExpression &&
    node.left.type === AST_NODE_TYPES.MemberExpression &&
    node.left.object.type === AST_NODE_TYPES.ThisExpression &&
    memberName(node.left) === key;
  return assigns ? { value: undefined, next: node.right } : undefined;
}

function expandField({ env, pending, goal }: Frame, member: TSESTree.MemberExpression): void {
  const key = memberName(member);
  const owner = classOf(member);
  if (owner === undefined || key === undefined) {
    return;
  }
  const candidates = [...descendants(owner.body)]
    .map((node) => fieldCandidate(env, node, key))
    .filter((candidate) => candidate !== undefined)
    .map(({ value, next }) => goalFor(goal, next, value));
  appendAll(pending, candidates);
  goal.children = candidates;
  goal.combine = (values) => values.find((value) => value !== undefined);
}

function expandMember(frame: Frame, member: TSESTree.MemberExpression): void {
  const { pending, goal } = frame;
  if (member.object.type === AST_NODE_TYPES.ThisExpression) {
    expandField(frame, member);
  } else {
    follow(pending, goal, { node: member.object, combine: (base) => memberOf(base, member) });
  }
}

function injected(env: Env, call: CreationNode, target: TSESTree.Identifier): MaybeOrigin {
  const definition = findVariable(env.context, target, target.name)?.defs[0];
  const angular =
    definition?.type === DefinitionType.ImportBinding &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration
      ? definition.parent.source.value
      : undefined;
  const [token] = call.arguments;
  const ref =
    token?.type === AST_NODE_TYPES.Identifier ? env.typeImports.get(token.name) : undefined;
  const spec = ref === undefined ? undefined : env.clientSpec(ref.source);
  return angular === '@angular/core' &&
    ref !== undefined &&
    spec !== undefined &&
    matchesType(spec, ref.imported)
    ? instance(spec, ref, call)
    : undefined;
}

function expandCall({ env, pending, goal }: Frame, call: CreationNode): void {
  const target = skipped(call.callee);
  const site = { target, call };
  if (target.type === AST_NODE_TYPES.Identifier && target.name === 'inject') {
    goal.value = injected(env, call, target);
  } else if (target.type === AST_NODE_TYPES.MemberExpression) {
    follow(pending, goal, { node: target.object, combine: (base) => madeBy(env, site, base) });
  } else {
    goal.value = madeBy(env, site, undefined);
  }
}

function expand(env: Env, pending: Goal[], goal: Goal): void {
  const frame: Frame = { env, pending, goal };
  const target = skipped(goal.node);
  if (goal.value !== undefined || target === undefined) {
    return;
  }
  if (goal.depth > MAX_DEPTH) {
    return;
  }
  if (target.type === AST_NODE_TYPES.Identifier) {
    expandIdentifier(frame, target);
  } else if (
    target.type === AST_NODE_TYPES.CallExpression ||
    target.type === AST_NODE_TYPES.NewExpression
  ) {
    expandCall(frame, target);
  } else if (target.type === AST_NODE_TYPES.MemberExpression) {
    expandMember(frame, target);
  }
}

function resolveOrigin(env: Env, node: TSESTree.Node): MaybeOrigin {
  const goals = [goalFor({ depth: -1 }, node, undefined)];
  for (const goal of goals) {
    expand(env, goals, goal);
  }
  for (const goal of goals.toReversed()) {
    if (goal.children.length > 0) {
      goal.value = goal.combine(goal.children.map((child) => child.value));
    }
  }
  return goals[0]?.value;
}

export function createOrigins(context: Context, clientSpec: SpecOf): Origins {
  const env: Env = {
    context,
    clientSpec,
    entries: moduleBindingsOf(context.sourceCode.ast, (source) => clientSpec(source) !== undefined),
    typeImports: typeImportsOf(context.sourceCode.ast, clientSpec),
  };
  return {
    originOf: (node) => resolveOrigin(env, node),
    moduleRef: (scopeNode, name) => moduleRef(env, scopeNode, name),
  };
}

function classOf(
  node: TSESTree.Node,
): TSESTree.ClassDeclaration | TSESTree.ClassExpression | undefined {
  return ancestorsOf(node).find((ancestor) => ancestor.type === AST_NODE_TYPES.ClassBody)?.parent;
}
