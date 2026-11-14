import { DECLARED } from '../creation/occurrences.mjs';
import { declaredTypes, importsOf, qualified } from '../creation/arg-types.mjs';
import { fieldInfo } from '../cross/fields.mjs';
import { nestedTypes } from '../cross/imports.mjs';
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

function formatsDates(method, receiver) {
  if (receiver?.type !== 'identifier') {
    return false;
  }
  const type =
    declaredTypes(method).get(receiver.text) ?? fieldInfo(method).get(receiver.text)?.type;
  return type !== undefined && FORMATTERS.has(qualified(type, importsOf(method.tree.rootNode)));
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
    [...tainted.values()].every((kind) => kind === 'direct') &&
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
