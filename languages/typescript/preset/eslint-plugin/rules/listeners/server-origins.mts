import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { depthFirst, nodeChildren, type SourceCode } from '../typed/node-views.mts';
import { calleeNameOf } from '../typed/syntax-views.mts';
import { variableOf } from '../caches/scope-names.mts';

const SERVER_MODULES = /^(?:node:)?(?:https?|net|http2)$|^(?:express|koa|connect|polka|restify)$/u;
const FACTORIES = new Set(['createServer', 'createSecureServer']);
const CONSTRUCTORS = new Set(['Koa', 'Server']);
const CHAINED = new Set(['use', 'get', 'post', 'put', 'delete', 'set', 'on', 'once']);
const MAX_DEPTH = 4;

export type Bindings = { readonly modules: Set<string>; readonly names: Set<string> };

function bindingNames(node: TSESTree.ImportDeclaration): string[] {
  return node.specifiers.map((specifier) => specifier.local.name);
}

function noteImport(bindings: Bindings, node: TSESTree.ImportDeclaration): void {
  const source = String(node.source.value);
  bindings.modules.add(source);
  if (SERVER_MODULES.test(source)) {
    bindingNames(node).forEach((name) => bindings.names.add(name));
  }
}

function noteRequire(bindings: Bindings, call: TSESTree.CallExpression): void {
  const first = call.arguments[0];
  if (
    call.callee.type !== AST_NODE_TYPES.Identifier ||
    call.callee.name !== 'require' ||
    first?.type !== AST_NODE_TYPES.Literal
  ) {
    return;
  }
  const source = String(first.value);
  bindings.modules.add(source);
  const declarator = call.parent;
  if (
    declarator.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.id.type === AST_NODE_TYPES.Identifier &&
    SERVER_MODULES.test(source)
  ) {
    bindings.names.add(declarator.id.name);
  }
}

export function serverBindings(program: TSESTree.Program): Bindings {
  const bindings: Bindings = { modules: new Set(), names: new Set() };
  for (const node of depthFirst<TSESTree.Node>(program, nodeChildren)) {
    if (node.type === AST_NODE_TYPES.ImportDeclaration) {
      noteImport(bindings, node);
    } else if (node.type === AST_NODE_TYPES.CallExpression) {
      noteRequire(bindings, node);
    }
  }
  return bindings;
}

function isBound(callee: TSESTree.Node, names: ReadonlySet<string>): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return names.has(callee.name);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    names.has(callee.object.name)
  );
}

type Site = {
  readonly sourceCode: SourceCode;
  readonly names: ReadonlySet<string>;
  readonly depth: number;
};

function deeper(site: Site): Site {
  return { ...site, depth: site.depth + 1 };
}

function isServerCall(site: Site, node: TSESTree.CallExpression): boolean {
  const name = calleeNameOf(node.callee);
  const created =
    isBound(node.callee, site.names) &&
    (node.callee.type === AST_NODE_TYPES.Identifier || FACTORIES.has(name ?? ''));
  const chained =
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    CHAINED.has(name ?? '') &&
    isServerAt(deeper(site), node.callee.object);
  return created || chained;
}

function isServerVariable(site: Site, node: TSESTree.Identifier): boolean {
  const variable = variableOf(site.sourceCode, node);
  const [definition] = variable?.defs ?? [];
  return (
    variable?.defs.length === 1 &&
    definition?.node.type === AST_NODE_TYPES.VariableDeclarator &&
    definition.node.init !== null &&
    isServerAt(deeper(site), definition.node.init)
  );
}

function isServerAt(site: Site, node: TSESTree.Node): boolean {
  if (site.depth > MAX_DEPTH) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return isBound(node.callee, site.names) && CONSTRUCTORS.has(calleeNameOf(node.callee) ?? '');
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return isServerCall(site, node);
  }
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return isServerAt(deeper(site), node.argument);
  }
  return node.type === AST_NODE_TYPES.Identifier && isServerVariable(site, node);
}

export function isServer(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  names: ReadonlySet<string>,
): boolean {
  return isServerAt({ sourceCode, names, depth: 0 }, node);
}
