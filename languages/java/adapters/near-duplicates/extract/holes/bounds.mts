import type { Node } from 'web-tree-sitter';
import type { NamedTypeHole, UsedTypeHole } from '../../extract-types.mts';
import { DECLARED } from '../creation/occurrences.mts';
import { importsOf, qualified } from '../creation/arg-types.mts';
import { fieldInfo } from '../cross/fields.mts';
import { nestedTypes } from '../cross/names/imports.mts';
import { descendants, field, parentOf, present, required, roleOf, squashed } from '../syntax.mts';
import { holeIds, taintedNames } from './type-use.mts';

const TARGET = 'java.util.Date';
const SUPERTYPES = new Set(['java.sql.Date', 'java.sql.Time', 'java.sql.Timestamp', TARGET]);
const FORMATTERS = new Set(['java.text.DateFormat', 'java.text.SimpleDateFormat']);
const BOUNDED = 'bounded';

function qualifiedName(node: Node): string | undefined {
  return qualified(squashed(node), importsOf(node.tree.rootNode));
}

function isParameterType(node: Node): boolean {
  return (
    parentOf(node).type === 'formal_parameter' && field(parentOf(node), 'type')?.id === node.id
  );
}

const NAMED_DECLARATIONS = new Set([
  'variable_declarator',
  'formal_parameter',
  'catch_formal_parameter',
  'enhanced_for_statement',
  'resource',
  'instanceof_expression',
]);

function bindsName(node: Node, name: string): boolean {
  if (NAMED_DECLARATIONS.has(node.type)) {
    return field(node, 'name')?.text === name;
  }
  if (node.type === 'lambda_expression') {
    const parameters = required(node, 'parameters');
    return parameters.type === 'identifier'
      ? parameters.text === name
      : parameters.type === 'inferred_parameters' &&
          parameters.namedChildren.some((child) => child.text === name);
  }
  if (node.type === 'type_pattern' || node.type === 'record_pattern_component') {
    return node.namedChildren.at(-1)?.text === name;
  }
  return false;
}

function formatsDates(method: Node, receiver: Node | undefined): boolean {
  if (receiver?.type !== 'identifier') {
    return false;
  }
  const declared = descendants(method).some((node) => bindsName(node, receiver.text));
  const type = fieldInfo(method).get(receiver.text)?.type;
  return (
    !declared &&
    type !== undefined &&
    FORMATTERS.has(qualified(type, importsOf(method.tree.rootNode)) ?? '')
  );
}

function isNullCheck(node: Node): boolean {
  const parent = parentOf(node);
  if (
    parent.type !== 'binary_expression' ||
    !['==', '!='].includes(required(parent, 'operator').text)
  ) {
    return false;
  }
  const other =
    required(parent, 'left').id === node.id ? required(parent, 'right') : required(parent, 'left');
  return other.type === 'null_literal';
}

function isFormatArgument(node: Node, method: Node): boolean {
  const call = parentOf(parentOf(node));
  return (
    parentOf(node).type === 'argument_list' &&
    parentOf(node).namedChildren.length === 1 &&
    call.type === 'method_invocation' &&
    required(call, 'name').text === 'format' &&
    formatsDates(method, field(call, 'object'))
  );
}

function usesOnly(method: Node, hole: UsedTypeHole): boolean {
  const tainted = taintedNames(method, holeIds([hole]));
  const declarations = new Set(hole.occurrences.map(({ a }) => required(parentOf(a), 'name').id));
  const hasInferred = descendants(method).some(
    (node) =>
      node.type === 'local_variable_declaration' && squashed(required(node, 'type')) === 'var',
  );
  return (
    !hasInferred &&
    descendants(required(method, 'body'))
      .filter(
        (node) =>
          node.type === 'identifier' && tainted.has(node.text) && roleOf(node) === 'reference',
      )
      .every(
        (node) => declarations.has(node.id) || isNullCheck(node) || isFormatArgument(node, method),
      )
  );
}

function isBoundable(method: Node, hole: UsedTypeHole): boolean {
  return (
    hole.usage === 'type' &&
    hole.kinds.every((kind) => kind === DECLARED) &&
    hole.occurrences.every(({ a, b }) =>
      [a, b].every((node) => SUPERTYPES.has(qualifiedName(node) ?? '')),
    ) &&
    hole.occurrences.every(({ a }) => isParameterType(a)) &&
    usesOnly(method, hole)
  );
}

export function boundedHoles(method: Node, typeHoles: readonly NamedTypeHole[]): NamedTypeHole[] {
  const root = method.tree.rootNode;
  const simple = present(TARGET.split('.').at(-1));
  const name =
    importsOf(root).get(simple) === TARGET && !nestedTypes(root).has(simple) ? simple : TARGET;
  return typeHoles.map((hole) =>
    isBoundable(method, hole) ? { ...hole, usage: BOUNDED, name } : hole,
  );
}

export function isBounded(hole: { readonly usage: string }): boolean {
  return hole.usage === BOUNDED;
}
