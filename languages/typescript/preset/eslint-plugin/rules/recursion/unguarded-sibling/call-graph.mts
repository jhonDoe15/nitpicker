import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { depthFirst, nameOf, nodeChildren } from '../../typed/node-views.mts';
import { isExport, isFunction, unwrapped, type FunctionNode } from '../../typed/syntax-views.mts';

export type EntryKind = 'module' | 'class';

export type Entry = {
  readonly name: string;
  readonly node: TSESTree.Node;
  readonly fn: FunctionNode;
};

export type CallSite = {
  readonly target: string;
  readonly pos: number;
};

export type EntryCalls = ReadonlyMap<string, readonly CallSite[]>;

const THIS_BOUNDARIES = new Set<string>([
  AST_NODE_TYPES.ClassDeclaration,
  AST_NODE_TYPES.ClassExpression,
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
]);

const CLASS_BOUNDARIES = new Set<string>([
  AST_NODE_TYPES.ClassDeclaration,
  AST_NODE_TYPES.ClassExpression,
]);

function variableEntriesOf(declaration: TSESTree.VariableDeclaration): Entry[] {
  const entries: Entry[] = [];
  for (const declarator of declaration.declarations) {
    const init = declarator.init === null ? undefined : unwrapped(declarator.init);
    if (
      declarator.id.type === AST_NODE_TYPES.Identifier &&
      init !== undefined &&
      isFunction(init)
    ) {
      entries.push({ name: declarator.id.name, node: declarator, fn: init });
    }
  }
  return entries;
}

function statementEntriesOf(statement: TSESTree.ProgramStatement): Entry[] {
  const inner = isExport(statement) ? statement.declaration : statement;
  if (inner === null || inner === undefined) {
    return [];
  }
  if (inner.type === AST_NODE_TYPES.FunctionDeclaration && inner.id !== null) {
    return [{ name: inner.id.name, node: inner, fn: inner }];
  }
  return inner.type === AST_NODE_TYPES.VariableDeclaration ? variableEntriesOf(inner) : [];
}

export function moduleEntriesOf(program: TSESTree.Program): Entry[] {
  return program.body.flatMap(statementEntriesOf);
}

export function memberKeyName(property: TSESTree.Node): string | undefined {
  if (property.type === AST_NODE_TYPES.PrivateIdentifier) {
    return `#${property.name}`;
  }
  return nameOf(property);
}

function classElementEntry(element: TSESTree.ClassElement): Entry | undefined {
  if (
    element.type === AST_NODE_TYPES.MethodDefinition &&
    element.kind === 'method' &&
    !element.computed &&
    isFunction(element.value)
  ) {
    const name = memberKeyName(element.key);
    return name === undefined ? undefined : { name, node: element, fn: element.value };
  }
  if (
    element.type === AST_NODE_TYPES.PropertyDefinition &&
    !element.computed &&
    element.value !== null
  ) {
    const value = unwrapped(element.value);
    const name = memberKeyName(element.key);
    return name !== undefined && isFunction(value) ? { name, node: element, fn: value } : undefined;
  }
  return undefined;
}

export function classEntryGroupsOf(body: TSESTree.ClassBody): Entry[][] {
  const instanceEntries: Entry[] = [];
  const staticEntries: Entry[] = [];
  for (const element of body.body) {
    const entry = classElementEntry(element);
    if (entry === undefined) {
      continue;
    }
    const isStatic = 'static' in element && element.static;
    (isStatic ? staticEntries : instanceEntries).push(entry);
  }
  return [instanceEntries, staticEntries].filter((group) => group.length > 1);
}

function callTargetOf(call: TSESTree.CallExpression, kind: EntryKind): string | undefined {
  const callee = unwrapped(call.callee);
  if (kind === 'module') {
    return callee.type === AST_NODE_TYPES.Identifier ? callee.name : undefined;
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    unwrapped(callee.object).type === AST_NODE_TYPES.ThisExpression
  ) {
    return memberKeyName(callee.property);
  }
  return undefined;
}

export function bodyNodesOf(body: TSESTree.Node, kind: EntryKind): TSESTree.Node[] {
  const boundaries = kind === 'class' ? THIS_BOUNDARIES : CLASS_BOUNDARIES;
  return [
    ...depthFirst<TSESTree.Node>(body, (node) =>
      node !== body && boundaries.has(node.type) ? [] : nodeChildren(node),
    ),
  ];
}

function entryCallsOf(entry: Entry, kind: EntryKind, names: ReadonlySet<string>): CallSite[] {
  const calls: CallSite[] = [];
  for (const node of bodyNodesOf(entry.fn.body, kind)) {
    if (node.type !== AST_NODE_TYPES.CallExpression) {
      continue;
    }
    const target = callTargetOf(node, kind);
    if (target !== undefined && names.has(target)) {
      calls.push({ target, pos: node.range[0] });
    }
  }
  return calls;
}

export function directCallsOf(entries: readonly Entry[], kind: EntryKind): EntryCalls {
  const names = new Set(entries.map((entry) => entry.name));
  const result = new Map<string, CallSite[]>();
  for (const entry of entries) {
    result.set(entry.name, entryCallsOf(entry, kind, names));
  }
  return result;
}
