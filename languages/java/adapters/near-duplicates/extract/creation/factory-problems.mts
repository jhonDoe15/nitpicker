import type { Node } from 'web-tree-sitter';
import type { FactoryGroup, Occurrence, Site, TypeSources } from '../../extract-types.mts';
import { field, parentOf, present, required, squashed } from '../syntax.mts';
import { thrownBy } from './exceptions/constructors.mts';

const INNER = 'a constructor of a differing type is a member class that needs its outer instance';
const RESULT = [
  'a constructor of a differing type is used where its type matters:',
  'only a return, an assignment or a declared local may take it',
].join(' ');
const UNKNOWN_THROWS =
  'the checked exceptions of a constructor of a differing type cannot be told from the source';
const UNCOVERED =
  'a constructor of a differing type throws a checked exception the catch clause does not cover';

export function resultProblem(creation: Node): string | undefined {
  const parent = parentOf(creation);
  function isValue(key: string): boolean {
    return field(parent, key)?.id === creation.id;
  }
  const takes =
    parent.type === 'return_statement' ||
    parent.type === 'expression_statement' ||
    (parent.type === 'assignment_expression' && isValue('right')) ||
    (parent.type === 'variable_declarator' &&
      isValue('value') &&
      squashed(required(parentOf(parent), 'type')) !== 'var');
  return takes ? undefined : RESULT;
}

export function innerProblem(
  methods: readonly Node[],
  creations: readonly { occurrence: Occurrence }[],
): string | undefined {
  const inner = methods.map(
    (method) =>
      new Set(
        parentOf(method)
          .namedChildren.filter(({ type }) => type === 'class_declaration')
          .map((member) => required(member, 'name').text),
      ),
  );
  const used = creations.flatMap(({ occurrence }) => [occurrence.a, occurrence.b].map(squashed));
  return used.some((text) => inner.some((names) => names.has(text))) ? INNER : undefined;
}

function simpleName(node: Node): string {
  return present(node.text.replaceAll(/\s+/gu, '').split('.').at(-1));
}

function uncovered(creation: Node, caught: Node, typeSources?: TypeSources): string | undefined {
  const thrown = thrownBy(creation, typeSources);
  if (thrown === undefined) {
    return UNKNOWN_THROWS;
  }
  const name = simpleName(caught);
  return thrown.every((found) => found === name || name === 'Exception') ? undefined : UNCOVERED;
}

export function throwsProblem(
  groups: readonly FactoryGroup[],
  ties: readonly (Site | undefined)[],
  typeSources?: TypeSources,
): string | undefined {
  return groups
    .flatMap((group, index) => {
      const tie = ties[index];
      return tie === undefined
        ? []
        : group.occurrences.flatMap(({ a, b }) => [
            uncovered(parentOf(a), tie.occurrence.a, typeSources),
            uncovered(parentOf(b), tie.occurrence.b, typeSources),
          ]);
    })
    .find(Boolean);
}
