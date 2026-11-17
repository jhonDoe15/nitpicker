import type { Node } from 'web-tree-sitter';
import type { OccurrenceHole, Taint } from '../../extract-types.mts';
import {
  METHOD,
  descendants,
  field,
  parentOf,
  present,
  required,
  roleOf,
  squashed,
} from '../syntax.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

const DIRECT = 'direct';
const CONTEXT = 'a differing type is used where a type parameter cannot stand for it';
const VALUES = 'the code uses a value of the differing type in a way a type parameter cannot cover';
const DECLARED_BY = new Set([
  'formal_parameter',
  'local_variable_declaration',
  'enhanced_for_statement',
]);
const SINKS = new Set([
  'add',
  'addAll',
  'put',
  'putAll',
  'offer',
  'push',
  'contains',
  'containsKey',
  'set',
]);
const RESULTING = new Set(['put', 'set', 'push']);
const NEUTRAL = new Set(['size', 'isEmpty', 'clear']);
const SOURCES = new Set([
  'get',
  'getFirst',
  'getLast',
  'getKey',
  'getValue',
  'entrySet',
  'keySet',
  'values',
  'remove',
  'poll',
  'peek',
  'pop',
  'element',
]);

function typePosition(node: Node): { nested: boolean; parent: Node; current: Node } | undefined {
  const chain = [node];
  let nested = false;
  for (const current of chain) {
    const parent = parentOf(current);
    if (parent.type === 'type_arguments') {
      nested = true;
      chain.push(parentOf(parent).type === 'generic_type' ? parentOf(parent) : parent);
    } else if (parent.type === 'array_type') {
      chain.push(parent);
    } else {
      return { nested, parent, current };
    }
  }
  return undefined;
}

function isTypeOf(parent: Node, current: Node): boolean {
  return field(parent, 'type')?.id === current.id;
}

function contextProblem(node: Node): string | undefined {
  const { nested, parent, current } = present(typePosition(node));
  if (nested) {
    return parent.type === 'class_literal' ? CONTEXT : undefined;
  }
  const declares = [...DECLARED_BY, METHOD].includes(parent.type) && isTypeOf(parent, current);
  return declares ? undefined : CONTEXT;
}

export function holeIds(typeHoles: readonly OccurrenceHole[]): Set<number> {
  return new Set(typeHoles.flatMap(({ occurrences }) => occurrences.map(({ a }) => a.id)));
}

function containsHole(typeNode: Node, ids: ReadonlySet<number>): boolean {
  return descendants(typeNode).some((part) => ids.has(part.id));
}

function declaredNames(declaration: Node): string[] {
  const names: Node[] = [];
  if (declaration.type === 'formal_parameter' || declaration.type === 'enhanced_for_statement') {
    names.push(required(declaration, 'name'));
  } else {
    appendAll(
      names,
      declaration.namedChildren
        .filter(({ type }) => type === 'variable_declarator')
        .map((declarator) => required(declarator, 'name')),
    );
  }
  return names.map(({ text }) => text);
}

function taintKind(declaration: Node, ids: ReadonlySet<number>): Taint | undefined {
  const type = field(declaration, 'type');
  if (type === undefined || !containsHole(type, ids)) {
    return undefined;
  }
  return ids.has(type.id) || type.type === 'array_type' ? DIRECT : 'container';
}

export function taintedNames(method: Node, ids: ReadonlySet<number>): Map<string, Taint> {
  const tainted = new Map<string, Taint>();
  for (const declaration of descendants(method).filter(({ type }) => DECLARED_BY.has(type))) {
    const kind = taintKind(declaration, ids);
    if (kind === undefined) {
      continue;
    }
    for (const name of declaredNames(declaration)) {
      tainted.set(name, kind);
    }
  }
  return tainted;
}

function readsTainted(declaration: Node, tainted: ReadonlyMap<string, Taint>): boolean {
  return descendants(declaration).some(
    (part) => part.type === 'identifier' && tainted.has(part.text),
  );
}

function propagateInferred(method: Node, tainted: Map<string, Taint>): void {
  const inferred = descendants(method).filter(
    (node) =>
      node.type === 'local_variable_declaration' && squashed(required(node, 'type')) === 'var',
  );
  for (const declaration of inferred) {
    if (!readsTainted(declaration, tainted)) {
      continue;
    }
    for (const name of declaredNames(declaration)) {
      tainted.set(name, DIRECT);
    }
  }
}

function isSinkArgument(expression: Node, tainted: ReadonlyMap<string, Taint>): boolean {
  const list = parentOf(expression);
  const call = list.type === 'argument_list' ? parentOf(list) : undefined;
  const receiver = call?.type === 'method_invocation' ? field(call, 'object') : undefined;
  return (
    receiver !== undefined &&
    tainted.get(receiver.text) === 'container' &&
    SINKS.has(required(present(call), 'name').text)
  );
}

function isPlainUse(expression: Node, tainted: ReadonlyMap<string, Taint>): boolean {
  const parent = parentOf(expression);
  const checks: Readonly<Record<string, () => boolean>> = {
    variable_declarator: () => field(parent, 'value')?.id === expression.id,
    assignment_expression: () => true,
    return_statement: () => true,
    expression_statement: () => true,
    enhanced_for_statement: () => field(parent, 'value')?.id === expression.id,
    binary_expression: () => ['==', '!='].includes(required(parent, 'operator').text),
    argument_list: () => isSinkArgument(expression, tainted),
  };
  return checks[parent.type]?.() === true;
}

function useProblem(node: Node, tainted: ReadonlyMap<string, Taint>): string | undefined {
  const parent = parentOf(node);
  const isReceiver = parent.type === 'method_invocation' && field(parent, 'object')?.id === node.id;
  if (!isReceiver) {
    return isPlainUse(node, tainted) ? undefined : VALUES;
  }
  const name = required(parent, 'name').text;
  if (tainted.get(node.text) === DIRECT) {
    return VALUES;
  }
  if (NEUTRAL.has(name)) {
    return undefined;
  }
  if (SINKS.has(name)) {
    return RESULTING.has(name) && !isPlainUse(parent, tainted) ? VALUES : undefined;
  }
  return SOURCES.has(name) && isPlainUse(parent, tainted) ? undefined : VALUES;
}

export function typeUseProblem(
  method: Node,
  typeHoles: readonly OccurrenceHole[],
): string | undefined {
  if (typeHoles.length === 0) {
    return undefined;
  }
  const occurrences = typeHoles.flatMap((hole) => hole.occurrences.map(({ a }) => a));
  const context = occurrences.map(contextProblem).find((found) => found !== undefined);
  if (context !== undefined) {
    return context;
  }
  const tainted = taintedNames(method, holeIds(typeHoles));
  propagateInferred(method, tainted);
  return descendants(required(method, 'body'))
    .filter(
      (node) =>
        node.type === 'identifier' && tainted.has(node.text) && roleOf(node) === 'reference',
    )
    .map((node) => useProblem(node, tainted))
    .find((found) => found !== undefined);
}
