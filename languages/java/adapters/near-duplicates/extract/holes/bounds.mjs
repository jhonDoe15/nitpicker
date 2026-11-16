import { DECLARED } from '../creation/occurrences.mjs';
import { importsOf, qualified } from '../creation/arg-types.mjs';
import { fieldInfo } from '../cross/fields.mjs';
import { nestedTypes } from '../cross/names/imports.mjs';
import { descendants, field, roleOf, squashed } from '../syntax.mjs';
import { holeIds, taintedNames } from './type-use.mjs';

const TARGET = 'java.util.Date';
const SUPERTYPES = new Set(['java.sql.Date', 'java.sql.Time', 'java.sql.Timestamp', TARGET]);
const FORMATTERS = new Set(['java.text.DateFormat', 'java.text.SimpleDateFormat']);
const BOUNDED = 'bounded';

function qualifiedName(node) {
  return qualified(squashed(node), importsOf(node.tree.rootNode));
}

function isParameterType(node) {
  return node.parent.type === 'formal_parameter' && field(node.parent, 'type')?.id === node.id;
}

const NAMED_DECLARATIONS = new Set([
  'variable_declarator',
  'formal_parameter',
  'catch_formal_parameter',
  'enhanced_for_statement',
  'resource',
  'instanceof_expression',
]);

function bindsName(node, name) {
  if (NAMED_DECLARATIONS.has(node.type)) {
    return field(node, 'name')?.text === name;
  }
  if (node.type === 'lambda_expression') {
    const parameters = field(node, 'parameters');
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

function formatsDates(method, receiver) {
  if (receiver?.type !== 'identifier') {
    return false;
  }
  const declared = descendants(method).some((node) => bindsName(node, receiver.text));
  const type = fieldInfo(method).get(receiver.text)?.type;
  return (
    !declared &&
    type !== undefined &&
    FORMATTERS.has(qualified(type, importsOf(method.tree.rootNode)))
  );
}

function isNullCheck(node) {
  const { parent } = node;
  if (
    parent.type !== 'binary_expression' ||
    !['==', '!='].includes(field(parent, 'operator').text)
  ) {
    return false;
  }
  const other =
    field(parent, 'left').id === node.id ? field(parent, 'right') : field(parent, 'left');
  return other.type === 'null_literal';
}

function isFormatArgument(node, method) {
  const call = node.parent.parent;
  return (
    node.parent.type === 'argument_list' &&
    node.parent.namedChildren.length === 1 &&
    call.type === 'method_invocation' &&
    field(call, 'name').text === 'format' &&
    formatsDates(method, field(call, 'object'))
  );
}

function usesOnly(method, hole) {
  const tainted = taintedNames(method, holeIds([hole]));
  const declarations = new Set(hole.occurrences.map(({ a }) => field(a.parent, 'name').id));
  const hasInferred = descendants(method).some(
    (node) => node.type === 'local_variable_declaration' && squashed(field(node, 'type')) === 'var',
  );
  return (
    !hasInferred &&
    descendants(field(method, 'body'))
      .filter(
        (node) =>
          node.type === 'identifier' && tainted.has(node.text) && roleOf(node) === 'reference',
      )
      .every(
        (node) => declarations.has(node.id) || isNullCheck(node) || isFormatArgument(node, method),
      )
  );
}

function isBoundable(method, hole) {
  return (
    hole.usage === 'type' &&
    hole.kinds.every((kind) => kind === DECLARED) &&
    hole.occurrences.every(({ a, b }) =>
      [a, b].every((node) => SUPERTYPES.has(qualifiedName(node))),
    ) &&
    hole.occurrences.every(({ a }) => isParameterType(a)) &&
    usesOnly(method, hole)
  );
}

export function boundedHoles(method, typeHoles) {
  const root = method.tree.rootNode;
  const simple = TARGET.split('.').at(-1);
  const name =
    importsOf(root).get(simple) === TARGET && !nestedTypes(root).has(simple) ? simple : TARGET;
  return typeHoles.map((hole) =>
    isBoundable(method, hole) ? { ...hole, usage: BOUNDED, name } : hole,
  );
}

export function isBounded(hole) {
  return hole.usage === BOUNDED;
}
