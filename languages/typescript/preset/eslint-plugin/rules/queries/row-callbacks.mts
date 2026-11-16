import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESTree,
} from '@typescript-eslint/utils';
import {
  memberName,
  staticKey,
  typeServices,
  unwrapped,
  type Context,
} from '../security/security-values.mts';
import { returnedExpression } from '../collections/costly-forms/repeated-runs.mts';
import { nameOf } from '../typed/node-views.mts';
import { isCallback } from '../typed/syntax-views.mts';
import { ts } from '../typed/typescript-views.mts';
import {
  FIELD_METHODS,
  fieldOf,
  newState,
  rootOf,
  type Field,
  type State,
} from './rows/field-visitor.mts';

type MaybeNode = TSESTree.Node | undefined;
type Entry = { readonly node: MaybeNode; readonly state: State };
type Work = {
  readonly entries: Entry[];
  readonly probes: { readonly probe: State; readonly owner: State }[];
};

type ReadOptions = { readonly rows: number; readonly accumulator?: true };

const MEMBERSHIP_METHODS = new Set<string | undefined>(['includes', 'has']);
const SIDE_EFFECTS = new Set<string>(['delete', 'typeof']);
const COMPUTED = ts.SymbolFlags.GetAccessor | ts.SymbolFlags.Method;

function visitIdentifier(node: TSESTree.Identifier, state: State): void {
  const field = fieldOf(node, state);
  if (field !== undefined) {
    state.fields.push(field);
  } else if (state.elements.has(node.name)) {
    state.valid = false;
  }
}

function queue(work: Work, nodes: readonly MaybeNode[], state: State): void {
  for (const node of nodes) {
    work.entries.push({ node, state });
  }
}

function visitComputedKeys(member: TSESTree.MemberExpression, state: State, work: Work): void {
  const { root, chain } = rootOf(member);
  queue(
    work,
    chain.filter((step) => step.computed).map((step) => step.property),
    state,
  );
  if (root.type !== AST_NODE_TYPES.Identifier) {
    queue(work, [root], state);
  }
}

function visitMember(node: TSESTree.MemberExpression, state: State, work: Work): void {
  const field = fieldOf(node, state);
  const { root } = rootOf(node);
  if (field !== undefined) {
    state.fields.push(field);
  } else if (root.type === AST_NODE_TYPES.Identifier && state.elements.has(root.name)) {
    state.valid = false;
    return;
  }
  visitComputedKeys(node, state, work);
}

function probeOf(state: State, work: Work, node: TSESTree.Node): void {
  const probe = newState(state.elements, state.accumulators);
  probe.destructured = state.destructured;
  work.probes.push({ probe, owner: state });
  queue(work, [node], probe);
}

function visitCall(node: TSESTree.CallExpression, state: State, work: Work): void {
  const callee = unwrapped(node.callee);
  const member = callee.type === AST_NODE_TYPES.MemberExpression ? callee : undefined;
  const method = member === undefined ? undefined : memberName(member);
  const field =
    member === undefined || method === undefined ? undefined : fieldOf(member.object, state);
  if (field !== undefined && FIELD_METHODS.has(method)) {
    state.fields.push(field);
  } else if (member !== undefined && MEMBERSHIP_METHODS.has(method)) {
    probeOf(state, work, member.object);
  } else {
    state.valid = false;
    return;
  }
  queue(work, node.arguments, state);
}

function visitProperty(node: TSESTree.ObjectLiteralElement, state: State, work: Work): void {
  if (node.type === AST_NODE_TYPES.SpreadElement) {
    queue(work, [node.argument], state);
    return;
  }
  queue(work, node.computed ? [node.key, node.value] : [node.value], state);
}

function visitSimple(target: TSESTree.Node, state: State, work: Work): boolean {
  if (target.type === AST_NODE_TYPES.Literal || target.type === AST_NODE_TYPES.ThisExpression) {
    return true;
  }
  if (target.type === AST_NODE_TYPES.Identifier) {
    visitIdentifier(target, state);
  } else if (target.type === AST_NODE_TYPES.MemberExpression) {
    visitMember(target, state, work);
  } else if (target.type === AST_NODE_TYPES.CallExpression) {
    visitCall(target, state, work);
  } else {
    return false;
  }
  return true;
}

function visitOperators(target: TSESTree.Node, state: State, work: Work): boolean {
  if (
    target.type === AST_NODE_TYPES.BinaryExpression ||
    target.type === AST_NODE_TYPES.LogicalExpression
  ) {
    queue(work, [target.left, target.right], state);
  } else if (target.type === AST_NODE_TYPES.ConditionalExpression) {
    queue(work, [target.test, target.consequent, target.alternate], state);
  } else if (target.type === AST_NODE_TYPES.UnaryExpression) {
    state.valid = state.valid && !SIDE_EFFECTS.has(target.operator);
    queue(work, [target.argument], state);
  } else {
    return false;
  }
  return true;
}

function visitCollections(target: TSESTree.Node, state: State, work: Work): boolean {
  if (target.type === AST_NODE_TYPES.TemplateLiteral) {
    queue(work, target.expressions, state);
  } else if (target.type === AST_NODE_TYPES.ArrayExpression) {
    queue(
      work,
      target.elements.map((element) => element ?? undefined),
      state,
    );
  } else if (target.type === AST_NODE_TYPES.ObjectExpression) {
    for (const property of target.properties) {
      visitProperty(property, state, work);
    }
  } else if (target.type === AST_NODE_TYPES.SpreadElement) {
    queue(work, [target.argument], state);
  } else {
    return false;
  }
  return true;
}

function visitEntry({ node, state }: Entry, work: Work): void {
  const target = unwrapped(node);
  const handled =
    target !== undefined &&
    (visitSimple(target, state, work) ||
      visitOperators(target, state, work) ||
      visitCollections(target, state, work));
  if (!handled) {
    state.valid = false;
  }
}

function visit(node: MaybeNode, state: State): void {
  const work: Work = { entries: [{ node, state }], probes: [] };
  for (const entry of work.entries) {
    visitEntry(entry, work);
  }
  for (const { probe, owner } of work.probes.toReversed()) {
    if (probe.fields.length > 0 || !probe.valid) {
      owner.valid = false;
    }
  }
}

function bindPattern(pattern: TSESTree.Parameter, state: State): boolean {
  if (pattern.type === AST_NODE_TYPES.Identifier) {
    state.elements.add(pattern.name);
    return true;
  }
  if (pattern.type !== AST_NODE_TYPES.ObjectPattern) {
    return false;
  }
  return pattern.properties.every((property) => {
    const key = staticKey(property);
    const bound =
      property.type === AST_NODE_TYPES.Property && property.value.type === AST_NODE_TYPES.Identifier
        ? property.value
        : undefined;
    if (key !== undefined && bound !== undefined) {
      state.destructured.set(bound.name, { owner: pattern, name: key });
    }
    return key !== undefined && bound !== undefined;
  });
}

function isComputed(services: ParserServicesWithTypeInformation, { owner, name }: Field): boolean {
  const property = services.getTypeAtLocation(owner).getProperty(name);
  return property !== undefined && (property.flags & COMPUTED) !== 0;
}

function readsColumns(context: Context, state: State): boolean {
  const services = typeServices(context);
  return services === undefined || !state.fields.some((field) => isComputed(services, field));
}

export function readsOnlyFields(
  context: Context,
  node: MaybeNode,
  { rows, accumulator }: ReadOptions,
): boolean {
  const fn = unwrapped(node);
  if (!isCallback(fn) || fn.async || fn.generator) {
    return false;
  }
  const leading = accumulator === undefined ? 0 : 1;
  const accumulators = new Set<string | undefined>(
    accumulator === undefined ? [] : [nameOf(fn.params[0])],
  );
  const state = newState(new Set(), accumulators);
  const rowParams = fn.params.slice(leading);
  const bound =
    fn.params.length === leading + rows && rowParams.every((p) => bindPattern(p, state));
  const body = bound ? returnedExpression(fn) : undefined;
  if (
    body === undefined ||
    (accumulator !== undefined && fn.params[0]?.type !== AST_NODE_TYPES.Identifier)
  ) {
    return false;
  }
  visit(body, state);
  return state.valid && state.fields.length > 0 && readsColumns(context, state);
}
