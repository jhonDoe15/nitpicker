import {
  NONE,
  at,
  field,
  fields,
  literal,
  numberText,
  opaque,
  operatorOf,
} from '../../../../java/adapters/near-duplicates/tree/nodes.mjs';
import { listOf } from '../../../../../shared/near-duplicates/unit-parts.mjs';

const BLOCK = 'block';

export { NONE, at, field, fields, listOf, literal, numberText, opaque, operatorOf };

const STATEMENT_TYPES = new Set([
  BLOCK,
  'statement_list',
  'expression_statement',
  'short_var_declaration',
  'var_declaration',
  'const_declaration',
  'type_declaration',
  'assignment_statement',
  'inc_statement',
  'dec_statement',
  'if_statement',
  'for_statement',
  'expression_switch_statement',
  'type_switch_statement',
  'select_statement',
  'return_statement',
  'break_statement',
  'continue_statement',
  'fallthrough_statement',
  'goto_statement',
  'go_statement',
  'defer_statement',
  'labeled_statement',
  'send_statement',
  'empty_statement',
]);

export function codeChildren(node) {
  return node.namedChildren.filter((child) => child.type !== 'comment');
}

export function isStatementNode(node) {
  return STATEMENT_TYPES.has(node.type) || node.parent?.type === 'statement_list';
}

export function typeText(source) {
  return source.text.replaceAll(/\s+/gu, ' ');
}

export function typeNode(source) {
  return source === undefined ? NONE : at({ kind: 'type', value: typeText(source) }, source);
}

export function namedType(value, source) {
  return at({ kind: 'type', value }, source);
}

export function grouped(value, source, children = []) {
  return at({ kind: 'statement', value }, source, children);
}

export function expression(value, source, children = []) {
  return at({ kind: 'expression', value }, source, children);
}

export function tuple(source, children) {
  return children.length === 1 ? children[0] : expression('tuple', source, children);
}

export function blockOf(source, context) {
  if (source === undefined) {
    return NONE;
  }
  return source.type === BLOCK ? context.get(source) : at(BLOCK, source, listOf([source], context));
}

export function listItems(list) {
  return list === undefined ? [] : codeChildren(list);
}

export function withInitializer(source, context, statement) {
  const init = field(source, 'initializer');
  return init === undefined
    ? statement
    : at(BLOCK, source, [...listOf([init], context), statement]);
}
