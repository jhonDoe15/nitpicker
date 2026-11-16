import type { Node } from 'web-tree-sitter';
import { THROW, ownNodes, runLocals } from './flow.mts';
import type { Input, Side } from './partial-types.mts';
import {
  codeParts,
  descendants,
  field,
  namedChildren,
  pairOf,
  present,
  required,
  squashed,
} from '../syntax.mts';

function typeWithDimensions(type: Node, owner: Node): string {
  const dimensions = field(owner, 'dimensions');
  return dimensions === undefined ? squashed(type) : `${squashed(type)}${squashed(dimensions)}`;
}

function declaredTypes(method: Node, name: string, before: number): (string | undefined)[] {
  return descendants(method)
    .filter((node) => node.startIndex < before)
    .flatMap((node) => {
      if (node.type === 'formal_parameter' || node.type === 'enhanced_for_statement') {
        return field(node, 'name')?.text === name
          ? [typeWithDimensions(required(node, 'type'), node)]
          : [];
      }
      if (node.type !== 'local_variable_declaration') {
        return [];
      }
      const declarators = codeParts(node).filter(
        (child) => child.type === 'variable_declarator' && required(child, 'name').text === name,
      );
      return declarators.map((declarator) =>
        field(declarator, 'value') === undefined
          ? undefined
          : typeWithDimensions(required(node, 'type'), declarator),
      );
    });
}

function typeOfInput(method: Node, name: string, before: number): string | undefined {
  const types = declaredTypes(method, name, before);
  const texts = new Set(types);
  const [text] = [...texts];
  return texts.size === 1 && text !== undefined && text !== 'var' ? text : undefined;
}

function firstUse(statements: readonly Node[], name: string): number {
  const use = statements
    .flatMap((statement) => descendants(statement))
    .find((node) => node.type === 'identifier' && node.text === name);
  return use === undefined ? Number.MAX_SAFE_INTEGER : use.startIndex;
}

export function inputsOf(
  sides: readonly Side[],
  bindings: readonly (readonly [string, string])[],
): { problem: string; inputs?: undefined } | { problem?: undefined; inputs: Input[] } {
  const [own, other] = pairOf(sides.map(({ statements }) => runLocals(statements)));
  if (bindings.some(([left, right]) => own.has(left) !== other.has(right))) {
    return { problem: 'one copy names a local of the run where the other names an outer one' };
  }
  const names = bindings
    .filter(([left]) => !own.has(left))
    .toSorted(
      ([left], [right]) =>
        firstUse(present(sides[0]).statements, left) -
        firstUse(present(sides[0]).statements, right),
    );
  const inputs = names.map((pair) => ({
    names: pair,
    types: sides.map(({ method, statements }, index) =>
      typeOfInput(method, present(pair[index]), present(statements[0]).startIndex),
    ),
  }));
  const unknown = inputs.some(({ types }) => types[0] === undefined || types[0] !== types[1]);
  return unknown
    ? { problem: 'an input of the run has no declared type, or a different one in each copy' }
    : {
        inputs: inputs.map(({ names: pair, types }) => ({ names: pair, type: present(types[0]) })),
      };
}

export function thrownTypes(statements: readonly Node[]): string {
  return ownNodes(statements)
    .filter(({ type }) => type === THROW)
    .map((node) => {
      const thrown = present(namedChildren(node)[0]);
      return thrown.type === 'object_creation_expression' ? squashed(required(thrown, 'type')) : '';
    })
    .join(',');
}
