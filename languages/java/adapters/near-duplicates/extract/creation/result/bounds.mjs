import { chainOf } from '../../../../../../../shared/traversal.mjs';
import { descendants, field, squashed } from '../../syntax.mjs';

const OBJECT = new Set(['Object', 'java.lang.Object']);
const BLOCKERS = new Set(['method_declaration', 'lambda_expression', 'class_body']);
const GENERIC = /[<[]/u;
const TARGET =
  'a constructor of a differing type is returned or stored as a type the shared code cannot name';

function enclosingMethod(node) {
  const ancestors = chainOf(node.parent, (current) => current.parent ?? undefined);
  const stop = ancestors.find(({ type }) => BLOCKERS.has(type));
  return stop?.type === 'method_declaration' ? stop : undefined;
}

function declaredTypeNode(method, name) {
  const found = descendants(method).filter(
    (node) =>
      (node.type === 'formal_parameter' || node.type === 'variable_declarator') &&
      field(node, 'name').text === name,
  );
  const [declaration] = found;
  const owner = declaration?.type === 'variable_declarator' ? declaration.parent : declaration;
  const hasDimensions = found.some((node) => field(node, 'dimensions') !== undefined);
  return found.length === 1 && !hasDimensions ? field(owner, 'type') : undefined;
}

function targetOf(creation) {
  const { parent } = creation;
  if (parent.type === 'expression_statement') {
    return { none: true };
  }
  const method = enclosingMethod(creation);
  if (method === undefined) {
    return undefined;
  }
  if (parent.type === 'return_statement') {
    return { node: field(method, 'type') };
  }
  if (parent.type === 'variable_declarator') {
    return field(parent, 'dimensions') === undefined
      ? { node: field(parent.parent, 'type') }
      : undefined;
  }
  const left = field(parent, 'left');
  const node = left?.type === 'identifier' ? declaredTypeNode(method, left.text) : undefined;
  return node === undefined ? undefined : { node };
}

function sideBound([here, there], { group, typeHoles }) {
  if (here === undefined || there === undefined || Boolean(here.none) !== Boolean(there.none)) {
    return { declined: TARGET };
  }
  if (here.none) {
    return {};
  }
  const hole = typeHoles.find(({ occurrences }) =>
    occurrences.some(({ a }) => a.id === here.node.id),
  );
  if (hole !== undefined) {
    return hole === group.hole ? {} : { declined: TARGET };
  }
  const text = squashed(here.node);
  if (text !== squashed(there.node) || GENERIC.test(text)) {
    return { declined: TARGET };
  }
  return OBJECT.has(text) ? {} : { bound: text };
}

function groupBound(group, typeHoles) {
  const sides = group.occurrences.map(({ a, b }) =>
    sideBound([targetOf(a.parent), targetOf(b.parent)], { group, typeHoles }),
  );
  const declined = sides.find((side) => side.declined !== undefined);
  const bounds = new Set(sides.flatMap(({ bound }) => (bound === undefined ? [] : [bound])));
  if (declined !== undefined || bounds.size > 1) {
    return { declined: TARGET };
  }
  return { bound: [...bounds][0] };
}

export function boundsOf(groups, typeHoles) {
  const found = groups.map((group) => ({ group, ...groupBound(group, typeHoles) }));
  if (found.some(({ declined }) => declined !== undefined)) {
    return { declined: TARGET };
  }
  const entries = found
    .filter(({ bound }) => bound !== undefined)
    .map(({ group, bound }) => [group.hole.name, bound]);
  const map = new Map(entries);
  const consistent = entries.every(([name, bound]) => map.get(name) === bound);
  return consistent ? { bounds: map } : { declined: TARGET };
}
