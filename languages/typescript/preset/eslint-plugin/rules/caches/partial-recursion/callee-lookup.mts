import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../../typed/node-views.mts';
import { isExport, isFunction, unwrapped, type FunctionNode } from '../../typed/syntax-views.mts';

type FunctionMap = Map<string, FunctionNode>;
type ClassNode = TSESTree.ClassDeclaration | TSESTree.ClassExpression;

function addDeclaration(statement: TSESTree.Node, map: FunctionMap): void {
  const decl = isExport(statement) ? statement.declaration : statement;
  if (decl === null || decl === undefined) {
    return;
  }
  if (decl.type === AST_NODE_TYPES.FunctionDeclaration && decl.id !== null) {
    map.set(decl.id.name, decl);
    return;
  }
  if (decl.type !== AST_NODE_TYPES.VariableDeclaration) {
    return;
  }
  for (const declarator of decl.declarations) {
    const id = nameOf(declarator.id);
    if (id !== undefined && declarator.init !== null && isFunction(declarator.init)) {
      map.set(id, declarator.init);
    }
  }
}

export function fileFunctionsOf(program: TSESTree.Program): FunctionMap {
  const map: FunctionMap = new Map();
  for (const statement of program.body) {
    addDeclaration(statement, map);
  }
  return map;
}

function localFunctionsOf(fn: FunctionNode): FunctionMap {
  const map: FunctionMap = new Map();
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return map;
  }
  for (const statement of fn.body.body) {
    addDeclaration(statement, map);
  }
  return map;
}

function addClassMember(element: TSESTree.ClassElement, map: FunctionMap): void {
  if (
    element.type === AST_NODE_TYPES.MethodDefinition &&
    !element.computed &&
    isFunction(element.value)
  ) {
    const key = nameOf(element.key);
    if (key !== undefined) {
      map.set(key, element.value);
    }
    return;
  }
  if (
    element.type === AST_NODE_TYPES.PropertyDefinition &&
    !element.computed &&
    element.value !== null &&
    isFunction(element.value)
  ) {
    const key = nameOf(element.key);
    if (key !== undefined) {
      map.set(key, element.value);
    }
  }
}

function classMethodsOf(fn: FunctionNode): FunctionMap {
  const map: FunctionMap = new Map();
  const owner = ancestorsOf(fn).find(
    (node): node is ClassNode =>
      node.type === AST_NODE_TYPES.ClassDeclaration || node.type === AST_NODE_TYPES.ClassExpression,
  );
  if (owner === undefined) {
    return map;
  }
  for (const element of owner.body.body) {
    addClassMember(element, map);
  }
  return map;
}

type CalleeScopes = {
  readonly file: FunctionMap;
  readonly local: FunctionMap;
  readonly methods: FunctionMap;
};

function resolveCallee(callee: TSESTree.Node, scopes: CalleeScopes): FunctionNode | undefined {
  const inner = unwrapped(callee);
  if (inner.type === AST_NODE_TYPES.Identifier) {
    return scopes.local.get(inner.name) ?? scopes.file.get(inner.name);
  }
  if (
    inner.type === AST_NODE_TYPES.MemberExpression &&
    !inner.computed &&
    inner.object.type === AST_NODE_TYPES.ThisExpression
  ) {
    const key = nameOf(inner.property);
    return key === undefined ? undefined : scopes.methods.get(key);
  }
  return undefined;
}

export function directCalleesOf(
  fn: FunctionNode,
  nodes: readonly TSESTree.Node[],
  fileFunctions: FunctionMap,
): FunctionNode[] {
  const scopes: CalleeScopes = {
    file: fileFunctions,
    local: localFunctionsOf(fn),
    methods: classMethodsOf(fn),
  };
  const seen = new Set<FunctionNode>([fn]);
  const callees: FunctionNode[] = [];
  for (const node of nodes) {
    if (node.type !== AST_NODE_TYPES.CallExpression) {
      continue;
    }
    const target = resolveCallee(node.callee, scopes);
    if (target !== undefined && !seen.has(target)) {
      seen.add(target);
      callees.push(target);
    }
  }
  return callees;
}
