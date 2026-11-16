import type { Node } from 'web-tree-sitter';
import type { BaseContext, PlacedNode, ShapeFields, ShapeNode } from '../jvm-types.mts';

export const NONE: ShapeNode = Object.freeze({ kind: 'none', children: Object.freeze([]) });

const COMMENTS = new Set(['line_comment', 'block_comment']);

const STATEMENT_TYPES = new Set([
  'block',
  'expression_statement',
  'local_variable_declaration',
  'if_statement',
  'return_statement',
  'throw_statement',
  'break_statement',
  'continue_statement',
  'for_statement',
  'enhanced_for_statement',
  'while_statement',
  'do_statement',
  'try_statement',
  'try_with_resources_statement',
  'labeled_statement',
  'synchronized_statement',
  'assert_statement',
  'yield_statement',
  'explicit_constructor_invocation',
  'class_declaration',
  'record_declaration',
  'enum_declaration',
  'interface_declaration',
  'local_class_declaration',
]);

export function present<Value>(value: Value): NonNullable<Value> {
  if (value === null || value === undefined) {
    throw new TypeError('A syntax node the grammar guarantees is missing');
  }
  return value;
}

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null;
}

export function parentOf(node: Node): Node {
  return present(node.parent);
}

export function required(node: Node, name: string): Node {
  return present(node.childForFieldName(name));
}

export function codeChildren(node: Node): Node[] {
  return node.namedChildren.filter((child) => !COMMENTS.has(child.type));
}

export function field(node: Node, name: string): Node | undefined {
  return node.childForFieldName(name) ?? undefined;
}

export function fields(node: Node, name: string): Node[] {
  return node.childrenForFieldName(name).filter(isNode);
}

export function textOf(node: Node): string {
  return node.text.replaceAll(/\s+/gu, '');
}

export function at(
  shape: string | ShapeFields,
  source: Node,
  children: readonly ShapeNode[] = [],
): PlacedNode {
  const fields = typeof shape === 'string' ? { kind: shape } : shape;
  return {
    ...fields,
    children,
    start: source.startPosition.row + 1,
    end: source.endPosition.row + 1,
  };
}

export function opaque(kind: string, source: Node): PlacedNode {
  return at({ kind, value: `${source.type}:${source.text.replaceAll(/\s+/gu, ' ')}` }, source);
}

export function isStatementNode(node: Node): boolean {
  return STATEMENT_TYPES.has(node.type) || node.parent?.type === 'block';
}

export function typeNode(source: Node | undefined): ShapeNode {
  return source === undefined ? NONE : at({ kind: 'type', value: textOf(source) }, source);
}

export function literal(
  kind: string,
  value: (source: Node) => string = (source) => source.text,
): (source: Node) => PlacedNode {
  return (source) => at({ kind: 'literal', literal: kind, value: value(source) }, source);
}

export function numberText(source: Node): string {
  return source.text.replaceAll('_', '').toLowerCase();
}

export function inner(source: Node, context: BaseContext): ShapeNode {
  return context.get(codeChildren(source)[0]);
}

export function grouped(value: string, source: Node, children: readonly ShapeNode[]): PlacedNode {
  return at({ kind: 'statement', value }, source, children);
}

export function blockOrStatements<Context extends BaseContext>(
  source: Node | undefined,
  context: Context,
  statements: (statement: Node, context: Context) => readonly ShapeNode[],
): ShapeNode {
  if (source === undefined) {
    return NONE;
  }
  return source.type === 'block'
    ? context.get(source)
    : at('block', source, statements(source, context));
}
