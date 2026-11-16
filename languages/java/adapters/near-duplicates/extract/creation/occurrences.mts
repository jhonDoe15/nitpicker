import type { Node } from 'web-tree-sitter';
import type { NamedTypeHole, TypeHole, UsedTypeHole } from '../../extract-types.mts';
import { field, parentOf, present } from '../syntax.mts';

const CATCH = 'catch';
const MIXED = 'mixed';
export const DECLARED = 'declared';

function isPlainCreation(creation: Node): boolean {
  return (
    present(creation.child(0)).type === 'new' &&
    !creation.children.some(({ type }) => type === 'class_body' || type === 'type_arguments')
  );
}

function occurrenceKind(node: Node): string {
  const parent = parentOf(node);
  if (parent.type === 'object_creation_expression') {
    return field(parent, 'type')?.id === node.id && isPlainCreation(parent) ? 'creation' : DECLARED;
  }
  return parent.type === 'catch_type' && parent.namedChildren.length === 1 ? CATCH : DECLARED;
}

function usageOf(kinds: readonly string[]): 'type' | 'exception' | 'mixed' {
  if (!kinds.includes(CATCH)) {
    return 'type';
  }
  return kinds.every((kind) => kind === CATCH) ? 'exception' : MIXED;
}

export function withUsage(hole: TypeHole): UsedTypeHole {
  const kinds = hole.occurrences.map(({ a, b }) => {
    const [kind, other] = [occurrenceKind(a), occurrenceKind(b)];
    return kind === other ? kind : MIXED;
  });
  return { ...hole, kinds, usage: kinds.includes(MIXED) ? MIXED : usageOf(kinds) };
}

export function declaredOnly(holes: readonly NamedTypeHole[]): NamedTypeHole[] {
  return holes.map((hole) => ({
    ...hole,
    occurrences: hole.occurrences.filter((_, index) => hole.kinds[index] === DECLARED),
  }));
}
