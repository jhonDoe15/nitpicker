import { field } from '../tree/nodes.mjs';

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

const DECLARATION_FIELDS = {
  variable_declarator: 'name',
  formal_parameter: 'name',
  catch_formal_parameter: 'name',
  enhanced_for_statement: 'name',
  resource: 'name',
};

export function codeParts(node) {
  return node.children.filter((child) => !COMMENTS.has(child.type));
}

export function namedChildren(node) {
  return node.namedChildren.filter((child) => !COMMENTS.has(child.type));
}

export function descendants(root) {
  const found = [];
  const pending = [root];
  for (const node of pending) {
    found.push(node);
    pending.push(...node.children);
  }
  return found;
}

export function squashed(node) {
  return node.text.replaceAll(/\s+/gu, ' ');
}

export function javaTypeOf(node) {
  if (INTEGER_LITERALS.has(node.type)) {
    return /[lL]$/u.test(node.text) ? 'long' : 'int';
  }
  if (FLOAT_LITERALS.has(node.type)) {
    return /[fF]$/u.test(node.text) ? 'float' : 'double';
  }
  const named = {
    character_literal: 'char',
    string_literal: 'String',
    true: 'boolean',
    false: 'boolean',
  };
  return named[node.type];
}

export function isLiteral(node) {
  return javaTypeOf(node) !== undefined;
}

export function roleOf(node) {
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

export function isWritten(node) {
  const parent = node.parent;
  if (parent === null) {
    return false;
  }
  if (parent.type === 'assignment_expression') {
    return field(parent, 'left')?.id === node.id;
  }
  return parent.type === 'update_expression';
}

export function nameCollisions(root) {
  return new Set(
    descendants(root)
      .filter(({ type }) => type === 'identifier' || type === 'type_identifier')
      .map(({ text }) => text),
  );
}

export { field };

export function parametersOf(method) {
  return namedChildren(field(method, 'parameters')).filter(
    (child) => child.type === 'formal_parameter',
  );
}
