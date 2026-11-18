import type { Node } from 'web-tree-sitter';
import type { Direct, FullContext } from '../../extract-types.mts';
import { hasModifier } from '../class-shape.mts';
import {
  codeParts,
  descendants,
  field,
  parametersOf,
  parentOf,
  present,
  required,
  roleOf,
  squashed,
} from '../syntax.mts';

const SUPPLIERS: Readonly<Record<string, readonly [string, string]>> = {
  int: ['java.util.function.IntSupplier', 'getAsInt'],
  long: ['java.util.function.LongSupplier', 'getAsLong'],
  double: ['java.util.function.DoubleSupplier', 'getAsDouble'],
  boolean: ['java.util.function.BooleanSupplier', 'getAsBoolean'],
};
const UNSUPPORTED_PRIMITIVES = new Set(['byte', 'short', 'char', 'float', 'void']);
const BLOCKED = new Set([
  'assignment_expression',
  'update_expression',
  'lambda_expression',
  'method_reference',
  'switch_expression',
  'class_body',
  'instanceof_expression',
  'array_creation_expression',
]);
const FIXED_CONTEXTS = new Set([
  'switch_label',
  'annotation',
  'marker_annotation',
  'element_value_pair',
]);

function flowOf(node: Node, method: Node): Node | string | undefined {
  if (isNestedInUnit(node, method)) {
    return undefined;
  }
  const parent = parentOf(node);
  if (parent.type === 'variable_declarator' && field(parent, 'value')?.id === node.id) {
    const declaration = parentOf(parent);
    const hasDimensions = field(parent, 'dimensions') !== undefined;
    const open =
      declaration.type === 'local_variable_declaration' && !hasModifier(declaration, 'final');
    return open && !hasDimensions ? field(declaration, 'type') : undefined;
  }
  if (parent.type === 'return_statement') {
    return field(method, 'type');
  }
  const isCondition =
    parent.type === 'parenthesized_expression' && parentOf(parent).type === 'if_statement';
  return isCondition ? 'boolean' : undefined;
}

const SCOPES = new Set([
  'lambda_expression',
  'class_body',
  'class_declaration',
  'record_declaration',
  'enum_declaration',
  'interface_declaration',
]);
const TRIES = new Set(['try_statement', 'try_with_resources_statement']);

function hasAncestor(node: Node, unit: Node, types: ReadonlySet<string>): boolean {
  const pending = [node.parent];
  for (const current of pending) {
    if (current === null || current.id === unit.id) {
      return false;
    }
    if (types.has(current.type)) {
      return true;
    }
    pending.push(current.parent);
  }
  return false;
}

function isNestedInUnit(node: Node, unit: Node): boolean {
  return hasAncestor(node, unit, SCOPES);
}

function typeOf(
  flow: Node | string | undefined,
): { text: string; node: Node | undefined } | undefined {
  if (flow === undefined) {
    return undefined;
  }
  const text = typeof flow === 'string' ? flow : squashed(flow);
  const unsupported = UNSUPPORTED_PRIMITIVES.has(text) || text === 'var';
  return unsupported ? undefined : { text, node: typeof flow === 'string' ? undefined : flow };
}

function readsTemplateLocal(
  node: Node,
  { unit, context, side }: { unit: Node; context: FullContext; side: number },
): boolean {
  const parameters = new Set(
    parametersOf(unit).map((parameter) => required(parameter, 'name').text),
  );
  return descendants(node).some(
    (part) =>
      part.type === 'identifier' &&
      roleOf(part) === 'reference' &&
      ((present(context.locals[side]).has(part.text) && !parameters.has(part.text)) ||
        present(context.written[side]).has(part.text)),
  );
}

function blockedIn(node: Node): boolean {
  return descendants(node).some((part) => BLOCKED.has(part.type));
}

function inFixedContext(node: Node, unit: Node): boolean {
  return hasAncestor(node, unit, FIXED_CONTEXTS);
}

export function deferredValue(node: Node, side: number, context: FullContext): Direct | undefined {
  const unit = present(context.units[side]);
  const throwing = codeParts(unit).some((child) => child.type === 'throws');
  const type = typeOf(flowOf(node, unit));
  const unusable =
    throwing ||
    hasAncestor(node, unit, TRIES) ||
    type === undefined ||
    blockedIn(node) ||
    inFixedContext(node, unit) ||
    readsTemplateLocal(node, { unit, context, side });
  return unusable ? undefined : { kind: 'deferred', type: type.text, typeNode: type.node };
}

export function supplierOf(
  hole: { readonly type: string },
  typeText?: string,
): { type: string; accessor: string } {
  const known = SUPPLIERS[hole.type];
  return known === undefined
    ? { type: `java.util.function.Supplier<${String(typeText)}>`, accessor: 'get' }
    : { type: known[0], accessor: known[1] };
}
