import type { Node } from 'web-tree-sitter';
import type {
  PlacedNode,
  ShapeNode,
} from '../../../../java/adapters/near-duplicates/jvm-types.mts';
import {
  NONE,
  at,
  field,
  fields,
  literal,
  numberText,
  opaque,
  operatorOf,
  present,
  required,
} from '../../../../java/adapters/near-duplicates/tree/nodes.mts';
import type { GoContext } from '../types/go-types.mts';
import { listOf } from '../types/go-views.mts';

const BLOCK = 'block';

export {
  NONE,
  at,
  field,
  fields,
  listOf,
  literal,
  numberText,
  opaque,
  operatorOf,
  present,
  required,
};

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

export function codeChildren(node: Node): Node[] {
  return node.namedChildren.filter((child) => child.type !== 'comment');
}

export function isStatementNode(node: Node): boolean {
  return STATEMENT_TYPES.has(node.type) || node.parent?.type === 'statement_list';
}

export function typeText(source: Node): string {
  return source.text.replaceAll(/\s+/gu, ' ');
}

export function typeNode(source: Node | undefined): ShapeNode {
  return source === undefined ? NONE : at({ kind: 'type', value: typeText(source) }, source);
}

export function namedType(value: string, source: Node): PlacedNode {
  return at({ kind: 'type', value }, source);
}

export function grouped(
  value: string,
  source: Node,
  children: readonly ShapeNode[] = [],
): PlacedNode {
  return at({ kind: 'statement', value }, source, children);
}

export function expression(
  value: string,
  source: Node,
  children: readonly ShapeNode[] = [],
): PlacedNode {
  return at({ kind: 'expression', value }, source, children);
}

export function tuple(source: Node, children: readonly ShapeNode[]): ShapeNode {
  const [only] = children;
  return children.length === 1 && only !== undefined ? only : expression('tuple', source, children);
}

export function blockOf(source: Node | undefined, context: GoContext): ShapeNode {
  if (source === undefined) {
    return NONE;
  }
  return source.type === BLOCK ? context.get(source) : at(BLOCK, source, listOf([source], context));
}

export function listItems(list: Node | undefined): Node[] {
  return list === undefined ? [] : codeChildren(list);
}

export function withInitializer(source: Node, context: GoContext, statement: ShapeNode): ShapeNode {
  const init = field(source, 'initializer');
  return init === undefined
    ? statement
    : at(BLOCK, source, [...listOf([init], context), statement]);
}
