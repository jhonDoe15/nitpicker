import type { Node } from 'web-tree-sitter';
import { chainOf, depthFirst } from '../../../../java/adapters/near-duplicates/jvm-views.mts';
import { codeChildren, field, fields } from './nodes.mts';

const IDENTIFIER = 'identifier';
const OPERAND = 'operand';

const FUNCTIONS = new Set(['function_declaration', 'method_declaration', 'func_literal']);
const OWN_SCOPE = new Set([
  'block',
  'if_statement',
  'for_statement',
  'expression_switch_statement',
  'type_switch_statement',
  'select_statement',
  'expression_case',
  'type_case',
  'default_case',
  'communication_case',
]);
const SAFE_TYPE =
  /^(?:\*|\[\]|map\[|chan\b|<-chan|func\b|error$|string$|bool$|(?:u?int\d*|uintptr|float\d+|complex\d+|byte|rune)$)/u;
const BLANK = '_';
const PATH_NODES = new Set(['selector_expression', 'index_expression', 'parenthesized_expression']);

type Scope = { readonly names: Map<string, string>; readonly parent: Scope | undefined };
type Declared = { readonly node: Node; readonly type: string | undefined };
type Visit = { readonly node: Node; readonly scope: Scope };
type Declare = { readonly declare: readonly Declared[]; readonly scope: Scope };
type Define = { readonly define: readonly Declared[]; readonly scope: Scope };
type Item = Visit | Declare | Define;
type State = {
  readonly counts: Map<string, number>;
  readonly resolved: Map<number, string>;
  readonly types: Map<string, string | undefined>;
  readonly addressed: Set<string>;
  readonly fresh: Set<number>;
};

export type Resolution = {
  readonly resolved: ReadonlyMap<number, string>;
  readonly addressed: ReadonlySet<string>;
  readonly fresh: ReadonlySet<number>;
};

function childScope(parent: Scope | undefined): Scope {
  return { names: new Map(), parent };
}

function lookup(scope: Scope, text: string): string | undefined {
  const chain = chainOf(scope, (current) => current.parent);
  return chain.find((current) => current.names.has(text))?.names.get(text);
}

function declare(state: State, scope: Scope, { node, type }: Declared): void {
  if (node.text === BLANK) {
    state.resolved.set(node.id, BLANK);
    return;
  }
  const count = state.counts.get(node.text) ?? 0;
  const value = count === 0 ? node.text : `${node.text}#${String(count)}`;
  state.counts.set(node.text, count + 1);
  scope.names.set(node.text, value);
  state.resolved.set(node.id, value);
  state.types.set(value, type);
  state.fresh.add(node.id);
}

function use(state: State, scope: Scope, node: Node): void {
  const value = lookup(scope, node.text);
  if (value !== undefined) {
    state.resolved.set(node.id, value);
  }
}

function declaredIn(node: Node): Declared[] {
  const written = field(node, 'type')?.text.replaceAll(/\s+/gu, '');
  const type = node.type === 'variadic_parameter_declaration' ? '[]' : written;
  return fields(node, 'name').map((name) => ({ node: name, type }));
}

function parameterNames(node: Node): Declared[] {
  const lists = ['receiver', 'parameters', 'result']
    .map((name) => field(node, name))
    .filter((list) => list?.type === 'parameter_list');
  return lists.flatMap((list) =>
    list === undefined ? [] : codeChildren(list).flatMap(declaredIn),
  );
}

function items(nodes: readonly (Node | undefined)[], scope: Scope): Visit[] {
  return nodes.flatMap((node) => (node === undefined ? [] : [{ node, scope }]));
}

function hasToken(node: Node, token: string): boolean {
  return node.children.some((child) => child.type === token);
}

function newNames(list: Node | undefined): Declared[] {
  const names = list === undefined ? [] : codeChildren(list);
  return names.filter(({ type }) => type === IDENTIFIER).map((node) => ({ node, type: undefined }));
}

function defines(node: Node, scope: Scope): Item[] {
  const left = field(node, 'left');
  return [...items([field(node, 'right')], scope), { define: newNames(left), scope }];
}

function typeSwitchItems(node: Node, scope: Scope): Item[] {
  const cases = codeChildren(node).filter(({ type }) => type.endsWith('_case'));
  return [
    ...items([field(node, 'initializer'), field(node, 'value')], scope),
    { declare: newNames(field(node, 'alias')), scope },
    ...items(cases, scope),
  ];
}

function specItems(node: Node, scope: Scope): Item[] {
  return [...items([field(node, 'value')], scope), { declare: declaredIn(node), scope }];
}

function rangeItems(node: Node, scope: Scope): Item[] {
  const left = field(node, 'left');
  const bound: Item[] = hasToken(node, ':=')
    ? [{ declare: newNames(left), scope }]
    : items([left], scope);
  return [...items([field(node, 'right')], scope), ...bound];
}

function markReceiver(node: Node, scope: Scope, state: State): void {
  const callee = field(node, 'function');
  const operand = callee?.type === 'selector_expression' ? field(callee, OPERAND) : undefined;
  const value = operand?.type === IDENTIFIER ? lookup(scope, operand.text) : undefined;
  if (value !== undefined && !SAFE_TYPE.test(state.types.get(value) ?? '')) {
    state.addressed.add(value);
  }
}

function nextOnPath(node: Node): Node | undefined {
  return PATH_NODES.has(node.type) ? (field(node, OPERAND) ?? codeChildren(node)[0]) : undefined;
}

function addressBase(node: Node): Node | undefined {
  const base = chainOf(field(node, OPERAND), nextOnPath).at(-1);
  return base?.type === IDENTIFIER ? base : undefined;
}

function markAddress(node: Node, scope: Scope, state: State): void {
  const base = node.children[0]?.type === '&' ? addressBase(node) : undefined;
  const value = base === undefined ? undefined : lookup(scope, base.text);
  if (value !== undefined) {
    state.addressed.add(value);
  }
}

function functionItems(node: Node, scope: Scope): Item[] {
  const inner = childScope(node.type === 'func_literal' ? scope : undefined);
  const body = field(node, 'body');
  const statements = body === undefined ? [] : codeChildren(body);
  return [{ declare: parameterNames(node), scope: inner }, ...items(statements, inner)];
}

const SPECIAL: Readonly<Record<string, (node: Node, scope: Scope) => Item[]>> = {
  short_var_declaration: defines,
  var_spec: specItems,
  const_spec: specItems,
  range_clause: rangeItems,
  type_switch_statement: typeSwitchItems,
};

function expand({ node, scope }: Visit, state: State): Item[] {
  if (node.type === IDENTIFIER) {
    use(state, scope, node);
    return [];
  }
  if (FUNCTIONS.has(node.type)) {
    return functionItems(node, scope);
  }
  if (node.type === 'call_expression') {
    markReceiver(node, scope, state);
  } else if (node.type === 'unary_expression') {
    markAddress(node, scope, state);
  }
  const inner = OWN_SCOPE.has(node.type) ? childScope(scope) : scope;
  const special =
    node.type === 'receive_statement' && hasToken(node, ':=') ? defines : SPECIAL[node.type];
  return special === undefined ? items(codeChildren(node), inner) : special(node, inner);
}

function define({ node, type }: Declared, scope: Scope, state: State): void {
  if (scope.names.has(node.text) && node.text !== BLANK) {
    use(state, scope, node);
  } else {
    declare(state, scope, { node, type });
  }
}

function runItem(item: Item, state: State): Item[] {
  if ('declare' in item) {
    for (const name of item.declare) {
      declare(state, item.scope, name);
    }
    return [];
  }
  if ('define' in item) {
    for (const name of item.define) {
      define(name, item.scope, state);
    }
    return [];
  }
  return expand(item, state);
}

export function resolveNames(root: Node): Resolution {
  const state: State = {
    counts: new Map(),
    resolved: new Map(),
    types: new Map(),
    addressed: new Set(),
    fresh: new Set(),
  };
  const start: Item = { node: root, scope: childScope(undefined) };
  Array.from(depthFirst<Item>(start, (item) => runItem(item, state)));
  return { resolved: state.resolved, addressed: state.addressed, fresh: state.fresh };
}
