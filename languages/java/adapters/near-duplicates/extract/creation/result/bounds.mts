import type { Node } from 'web-tree-sitter';
import type { Attempt, FactoryGroup, NamedTypeHole } from '../../../extract-types.mts';
import { chainOf } from '../../../jvm-views.mts';
import { descendants, field, parentOf, present, required, squashed } from '../../syntax.mts';

type Target =
  | { readonly none: true; readonly node?: undefined }
  | { readonly none?: undefined; readonly node: Node | undefined };
type Bound = Attempt<{ bound?: string | undefined }>;

const OBJECT = new Set(['Object', 'java.lang.Object']);
const BLOCKERS = new Set(['method_declaration', 'lambda_expression', 'class_body']);
const GENERIC = /[<[]/u;
const TARGET =
  'a constructor of a differing type is returned or stored as a type the shared code cannot name';

function enclosingMethod(node: Node): Node | undefined {
  const ancestors = chainOf(node.parent ?? undefined, (current) => current.parent ?? undefined);
  const stop = ancestors.find(({ type }) => BLOCKERS.has(type));
  return stop?.type === 'method_declaration' ? stop : undefined;
}

function declaredTypeNode(method: Node, name: string): Node | undefined {
  const found = descendants(method).filter(
    (node) =>
      (node.type === 'formal_parameter' || node.type === 'variable_declarator') &&
      required(node, 'name').text === name,
  );
  const [declaration] = found;
  const owner = declaration?.type === 'variable_declarator' ? parentOf(declaration) : declaration;
  const hasDimensions = found.some((node) => field(node, 'dimensions') !== undefined);
  return found.length === 1 && !hasDimensions && owner !== undefined
    ? field(owner, 'type')
    : undefined;
}

function targetOf(creation: Node): Target | undefined {
  const parent = parentOf(creation);
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
      ? { node: field(parentOf(parent), 'type') }
      : undefined;
  }
  const left = field(parent, 'left');
  const node = left?.type === 'identifier' ? declaredTypeNode(method, left.text) : undefined;
  return node === undefined ? undefined : { node };
}

function sideBound(
  [here, there]: readonly [Target | undefined, Target | undefined],
  { group, typeHoles }: { group: FactoryGroup; typeHoles: readonly NamedTypeHole[] },
): Bound {
  if (here === undefined || there === undefined || Boolean(here.none) !== Boolean(there.none)) {
    return { declined: TARGET };
  }
  if (here.none) {
    return {};
  }
  const hole = typeHoles.find(({ occurrences }) =>
    occurrences.some(({ a }) => a.id === present(here.node).id),
  );
  if (hole !== undefined) {
    return hole === group.hole ? {} : { declined: TARGET };
  }
  const text = squashed(present(here.node));
  if (text !== squashed(present(there.node)) || GENERIC.test(text)) {
    return { declined: TARGET };
  }
  return OBJECT.has(text) ? {} : { bound: text };
}

function groupBound(group: FactoryGroup, typeHoles: readonly NamedTypeHole[]): Bound {
  const sides = group.occurrences.map(({ a, b }) =>
    sideBound([targetOf(parentOf(a)), targetOf(parentOf(b))], { group, typeHoles }),
  );
  const declined = sides.find((side) => side.declined !== undefined);
  const bounds = new Set(sides.flatMap(({ bound }) => (bound === undefined ? [] : [bound])));
  if (declined !== undefined || bounds.size > 1) {
    return { declined: TARGET };
  }
  return { bound: [...bounds][0] };
}

export function boundsOf(
  groups: readonly FactoryGroup[],
  typeHoles: readonly NamedTypeHole[],
): Attempt<{ bounds: Map<string, string> }> {
  const found = groups.map((group) => ({ group, ...groupBound(group, typeHoles) }));
  if (found.some(({ declined }) => declined !== undefined)) {
    return { declined: TARGET };
  }
  const entries = found.flatMap(({ group, bound }): [string, string][] =>
    bound === undefined ? [] : [[group.hole.name, bound]],
  );
  const map = new Map(entries);
  const consistent = entries.every(([name, bound]) => map.get(name) === bound);
  return consistent ? { bounds: map } : { declined: TARGET };
}
