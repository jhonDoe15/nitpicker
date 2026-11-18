import type { Node } from 'web-tree-sitter';
import { field, parentOf, present, required } from '../tree/nodes.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';

export const METHOD = 'method_declaration';
export const CLASS = 'class_declaration';

const COMMENTS = new Set(['line_comment', 'block_comment']);

const INTEGER_LITERALS = new Set([
  'decimal_integer_literal',
  'hex_integer_literal',
  'octal_integer_literal',
  'binary_integer_literal',
]);

const FLOAT_LITERALS = new Set(['decimal_floating_point_literal', 'hex_floating_point_literal']);

const DECLARATION_FIELDS: Readonly<Record<string, string>> = {
  variable_declarator: 'name',
  formal_parameter: 'name',
  catch_formal_parameter: 'name',
  enhanced_for_statement: 'name',
  resource: 'name',
};

export function codeParts(node: Node): Node[] {
  return node.children.filter((child) => !COMMENTS.has(child.type));
}

export function namedChildren(node: Node): Node[] {
  return node.namedChildren.filter((child) => !COMMENTS.has(child.type));
}

export function descendants(root: Node): Node[] {
  const found: Node[] = [];
  const pending = [root];
  for (const node of pending) {
    found.push(node);
    appendAll(pending, node.children);
  }
  return found;
}

type Side = { readonly root: Node; readonly from: number; readonly to: number };

export function droppedComments(sides: readonly Side[]): Node[] {
  const [kept = [], dropped = []] = sides.map(({ root, from, to }) =>
    descendants(root).filter(
      ({ type, startIndex, endIndex }) =>
        COMMENTS.has(type) && startIndex >= from && endIndex <= to,
    ),
  );
  const known = new Set(kept.map((node) => squashed(node)));
  return dropped.filter((node) => !known.has(squashed(node)));
}

export function lostComments(sides: readonly Side[]): boolean {
  return droppedComments(sides).length > 0;
}

export function suppressions(node: Node): string[] {
  const modifiers = node.children.find(({ type }) => type === 'modifiers');
  return (modifiers?.children ?? [])
    .filter(
      (part) => part.type === 'annotation' && required(part, 'name').text === 'SuppressWarnings',
    )
    .map((part) => part.text);
}

export function squashed(node: Node): string {
  return node.text.replaceAll(/\s+/gu, ' ');
}

export function javaTypeOf(node: Node): string | undefined {
  if (INTEGER_LITERALS.has(node.type)) {
    return /[lL]$/u.test(node.text) ? 'long' : 'int';
  }
  if (FLOAT_LITERALS.has(node.type)) {
    return /[fF]$/u.test(node.text) ? 'float' : 'double';
  }
  const named: Readonly<Record<string, string>> = {
    character_literal: 'char',
    string_literal: 'String',
    true: 'boolean',
    false: 'boolean',
  };
  return named[node.type];
}

export function isLiteral(node: Node): boolean {
  return javaTypeOf(node) !== undefined;
}

export function roleOf(node: Node): 'reference' | 'member' | 'declaration' | 'other' {
  const parent = node.parent;
  if (parent === null) {
    return 'reference';
  }
  if (parent.type === 'method_invocation' && field(parent, 'name')?.id === node.id) {
    return 'member';
  }
  if (parent.type === 'field_access' && field(parent, 'field')?.id === node.id) {
    return 'member';
  }
  const declaring = DECLARATION_FIELDS[parent.type];
  if (declaring !== undefined && field(parent, declaring)?.id === node.id) {
    return 'declaration';
  }
  const other = new Set([
    'scoped_identifier',
    'scoped_type_identifier',
    'labeled_statement',
    'break_statement',
    'continue_statement',
    'marker_annotation',
    'annotation',
    'method_reference',
    'element_value_pair',
    'import_declaration',
    'package_declaration',
  ]);
  return other.has(parent.type) ? 'other' : 'reference';
}

export function isWritten(node: Node): boolean {
  const parent = node.parent;
  if (parent === null) {
    return false;
  }
  if (parent.type === 'assignment_expression') {
    return field(parent, 'left')?.id === node.id;
  }
  return parent.type === 'update_expression';
}

export function nameCollisions(root: Node): Set<string> {
  return new Set(
    descendants(root)
      .filter(({ type }) => type === 'identifier' || type === 'type_identifier')
      .map(({ text }) => text),
  );
}

export { field, parentOf, present, required };

export function parametersOf(method: Node): Node[] {
  return namedChildren(required(method, 'parameters')).filter(
    (child) => child.type === 'formal_parameter',
  );
}

export function pairOf<Item>(
  items: readonly Item[],
): readonly [NonNullable<Item>, NonNullable<Item>] {
  const [first, second] = items;
  return [present(first), present(second)];
}
