export const NONE = Object.freeze({ kind: 'none', children: Object.freeze([]) });

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

export function codeChildren(node) {
  return node.namedChildren.filter((child) => !COMMENTS.has(child.type));
}

export function field(node, name) {
  return node.childForFieldName(name) ?? undefined;
}

export function fields(node, name) {
  return node.childrenForFieldName(name).filter((child) => child !== null);
}

export function textOf(node) {
  return node.text.replaceAll(/\s+/gu, '');
}

export function at(shape, source, children = []) {
  const fields = typeof shape === 'string' ? { kind: shape } : shape;
  return {
    ...fields,
    children,
    start: source.startPosition.row + 1,
    end: source.endPosition.row + 1,
  };
}

export function opaque(kind, source) {
  return at({ kind, value: `${source.type}:${source.text.replaceAll(/\s+/gu, ' ')}` }, source);
}

export function isStatementNode(node) {
  return STATEMENT_TYPES.has(node.type) || node.parent?.type === 'block';
}

export function typeNode(source) {
  return source === undefined ? NONE : at({ kind: 'type', value: textOf(source) }, source);
}

export function literal(kind, value = (source) => source.text) {
  return (source) => at({ kind: 'literal', literal: kind, value: value(source) }, source);
}

export function numberText(source) {
  return source.text.replaceAll('_', '').toLowerCase();
}

export function inner(source, context) {
  return context.get(codeChildren(source)[0]);
}

export function grouped(value, source, children) {
  return at({ kind: 'statement', value }, source, children);
}
