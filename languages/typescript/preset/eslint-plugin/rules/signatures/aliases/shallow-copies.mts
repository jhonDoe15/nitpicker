import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, resolveFunction } from '../../analysis/constant-resolution.mts';
import {
  isFunction,
  unwrapOf,
  ASSERTION_FORMS,
  type FunctionNode,
} from '../../typed/syntax-views.mts';
import { nameOf } from '../../typed/node-views.mts';
import { returnedValues } from '../../comparisons/comparator-outcomes.mts';
import { changedParameter } from '../parameter-owners.mts';
import { isObjectAssign } from '../parameter-copies.mts';
import { parameterWalk, type Mutation, type MutationScope } from './mutations.mts';

type Copy = { readonly sources: readonly TSESTree.Node[]; readonly own: ReadonlySet<string> };

function objectCopy(node: TSESTree.ObjectExpression): Copy {
  const sources: TSESTree.Node[] = [];
  const own = new Set<string>();
  for (const property of node.properties) {
    if (property.type === AST_NODE_TYPES.SpreadElement) {
      sources.push(property.argument);
    } else {
      own.add(nameOf(property.key) ?? '*');
    }
  }
  return { sources, own };
}

function helperCopy(scope: MutationScope, call: TSESTree.CallExpression): Copy | undefined {
  const helper = resolveFunction(scope, call.callee);
  if (helper === undefined || !isFunction(helper)) {
    return undefined;
  }
  const values = returnedValues(helper).map((value) => unwrapOf(value, ASSERTION_FORMS));
  const copies = values.map((value) =>
    value.type === AST_NODE_TYPES.ObjectExpression ? objectCopy(value) : undefined,
  );
  if (copies.length === 0 || copies.some((copy) => copy === undefined || copy.own.size > 0)) {
    return undefined;
  }
  return {
    sources: argumentsFor(
      helper,
      call,
      copies.flatMap((copy) => copy?.sources ?? []),
    ),
    own: new Set(),
  };
}

function argumentsFor(
  helper: FunctionNode,
  call: TSESTree.CallExpression,
  sources: readonly TSESTree.Node[],
): TSESTree.Node[] {
  return sources.flatMap((source) => {
    const index = helper.params.findIndex(
      (param) => param.type === AST_NODE_TYPES.Identifier && param.name === nameOf(source),
    );
    const argument = call.arguments[index];
    return argument === undefined ? [] : [argument];
  });
}

function copyOf(scope: MutationScope, init: TSESTree.Node): Copy | undefined {
  const value = unwrapOf(init, ASSERTION_FORMS);
  if (value.type === AST_NODE_TYPES.ObjectExpression) {
    return objectCopy(value);
  }
  if (value.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const [target, ...rest] = value.arguments;
  if (isObjectAssign(value) && target?.type === AST_NODE_TYPES.ObjectExpression) {
    const base = objectCopy(target);
    return { sources: [...base.sources, ...rest], own: base.own };
  }
  return helperCopy(scope, value);
}

function chain(object: TSESTree.Node): { root: TSESTree.Identifier; first: string } | undefined {
  let current = unwrapOf(object, ASSERTION_FORMS);
  let first: string | undefined;
  while (current.type === AST_NODE_TYPES.MemberExpression) {
    first = current.computed ? undefined : nameOf(current.property);
    current = unwrapOf(current.object, ASSERTION_FORMS);
  }
  return current.type === AST_NODE_TYPES.Identifier && first !== undefined
    ? { root: current, first }
    : undefined;
}

function reassigned(scope: MutationScope, root: TSESTree.Identifier, first: string): boolean {
  const variable = findVariable(scope, root, root.name);
  return (variable?.references ?? []).some(({ identifier }) => {
    const member = identifier.parent;
    const assigned: TSESTree.Node | undefined = member.parent;
    return (
      member.type === AST_NODE_TYPES.MemberExpression &&
      nameOf(member.property) === first &&
      assigned?.type === AST_NODE_TYPES.AssignmentExpression &&
      assigned.left === member
    );
  });
}

export function nestedCopyWrite(
  scope: MutationScope,
  mutation: Mutation,
  node: TSESTree.Node,
): ReturnType<typeof changedParameter> {
  const found = chain(mutation.object);
  const variable =
    found === undefined ? undefined : findVariable(scope, found.root, found.root.name);
  const [definition] = variable?.defs ?? [];
  const declarator = definition?.node;
  const fixed = variable?.references.every((reference) => !reference.isWrite() || reference.init);
  if (
    found === undefined ||
    mutation.object.type !== AST_NODE_TYPES.MemberExpression ||
    declarator?.type !== AST_NODE_TYPES.VariableDeclarator ||
    declarator.init === null ||
    fixed !== true
  ) {
    return undefined;
  }
  const copy = copyOf(scope, declarator.init);
  const walk = parameterWalk(scope);
  if (
    copy === undefined ||
    copy.own.has(found.first) ||
    reassigned(scope, found.root, found.first)
  ) {
    return undefined;
  }
  return copy.sources
    .map((source) => changedParameter(walk, source, node))
    .find((definition) => definition !== undefined);
}
