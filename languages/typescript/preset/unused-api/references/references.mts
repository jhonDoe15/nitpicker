import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { syntaxChildren } from '../../syntax/children.mts';
import type {
  FileState,
  Passes,
  Registry,
  ReferenceState,
  TargetContext,
} from '../typed/context-types.mts';
import { depthFirst } from '../typed/syntax-views.mts';
import { isWrapperCall } from '../syntax/candidates.mts';
import { wrappedReference } from '../syntax/declarations.mts';
import {
  allPasses,
  calleeName,
  emptyPasses,
  jsxPasses,
  objectPasses,
  unwrapExpression,
} from '../syntax/passes.mts';
import { referencedSymbol, targetOf, targetOfSymbol } from '../syntax/resolve.mts';
import { handleDefaultProps, handleElementCall, isElementCall } from './element-calls.mts';
import { handleModuleLoad, isModuleLoad } from './module-loads.mts';
import {
  consume,
  escapeModule,
  leftmost,
  mayBeTarget,
  record,
  referencedComponent,
} from './state.mts';

const ts = typescriptApi();
const FORWARDING_MEMBERS = new Set(['call', 'apply', 'bind']);

function isSkippedSubtree(node: TypeScript.Node): boolean {
  return (
    ts.isImportDeclaration(node) ||
    ts.isExportDeclaration(node) ||
    ts.isImportEqualsDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isJsxClosingElement(node) ||
    ts.isTypeNode(node)
  );
}

function importBindings(statement: TypeScript.ImportDeclaration): TypeScript.Identifier[] {
  const clause = statement.importClause;
  const bindings = clause?.namedBindings;
  const named =
    bindings && ts.isNamedImports(bindings) ? bindings.elements.map(({ name }) => name) : [];
  return [clause?.name, ...named].filter((binding) => binding !== undefined);
}

function importedNames({ sourceFile, ...state }: FileState): {
  names: Set<string>;
  namespaces: Set<string>;
} {
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const namespaces = imports
    .map((statement) => statement.importClause?.namedBindings)
    .filter((bindings) => bindings !== undefined && ts.isNamespaceImport(bindings))
    .map((bindings) => bindings.name.text);
  const locals = imports
    .flatMap(importBindings)
    .filter((local) => targetOf(state, local) !== undefined)
    .map(({ text }) => text);
  return { names: new Set([...state.registry.names, ...locals]), namespaces: new Set(namespaces) };
}

function handleJsx(
  node: TypeScript.JsxOpeningElement | TypeScript.JsxSelfClosingElement,
  state: ReferenceState,
): void {
  const target = referencedComponent(node.tagName, state);
  if (target === undefined) {
    return;
  }
  consume(node.tagName, state);
  record({ target, state, kind: 'call', passes: jsxPasses(node) });
}

function optionsPasses(call: TypeScript.CallExpression, index: number): Passes {
  const leading = call.arguments.slice(0, index + 1);
  if (leading.some(ts.isSpreadElement)) {
    return allPasses();
  }
  const options = leading[index];
  return options === undefined ? emptyPasses() : objectPasses(options);
}

function handleDirectCall(
  call: TypeScript.CallExpression,
  callee: TypeScript.Expression,
  state: ReferenceState,
): void {
  if (!mayBeTarget(callee, state)) {
    return;
  }
  const target = targetOf(state, callee);
  if (target === undefined) {
    return;
  }
  consume(callee, state);
  const passes = target.kind === 'function' ? optionsPasses(call, target.index) : allPasses();
  record({ target, state, kind: 'call', passes });
}

function consumeWrapped(call: TypeScript.CallExpression, state: ReferenceState): void {
  const parent = call.parent;
  const isAlias = ts.isVariableDeclaration(parent) || ts.isExportAssignment(parent);
  const reference = isAlias ? wrappedReference(call) : undefined;
  if (reference !== undefined) {
    consume(reference, state);
  }
}

function handleCall(call: TypeScript.CallExpression, state: ReferenceState): void {
  const callee = unwrapExpression(call.expression);
  const name = calleeName(callee);
  if (isModuleLoad(callee)) {
    handleModuleLoad(call, callee, state);
  } else if (isElementCall(name)) {
    handleElementCall(call, name, state);
  } else {
    handleDirectCall(call, callee, state);
  }
  if (isWrapperCall(call)) {
    consumeWrapped(call, state);
  }
}

function isBenignAccess(identifier: TypeScript.Identifier): boolean {
  const parent = identifier.parent;
  return (
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === identifier &&
    !FORWARDING_MEMBERS.has(parent.name.text)
  );
}

function isDeclarationName(
  symbol: TypeScript.Symbol | undefined,
  identifier: TypeScript.Identifier,
): boolean {
  return (symbol?.declarations ?? []).some(
    (declaration) => ts.getNameOfDeclaration(declaration) === identifier,
  );
}

function handleNamespace(identifier: TypeScript.Identifier, state: ReferenceState): void {
  if (isBenignAccess(identifier) || identifier.parent.kind === ts.SyntaxKind.NamespaceImport) {
    return;
  }
  const symbol = referencedSymbol(state.checker, identifier);
  if (symbol !== undefined && symbol.flags & ts.SymbolFlags.ValueModule) {
    escapeModule(symbol, state);
  }
}

function viaNamespace(identifier: TypeScript.Identifier, state: ReferenceState): boolean {
  const isMember =
    ts.isPropertyAccessExpression(identifier.parent) && identifier.parent.name === identifier;
  const root = isMember ? leftmost(identifier.parent) : undefined;
  return root !== undefined && ts.isIdentifier(root) && state.namespaces.has(root.text);
}

function handleIdentifier(identifier: TypeScript.Identifier, state: ReferenceState): void {
  if (state.consumed.has(identifier) || ts.isExportAssignment(identifier.parent)) {
    return;
  }
  if (state.namespaces.has(identifier.text)) {
    handleNamespace(identifier, state);
  }
  if (!(state.names.has(identifier.text) || viaNamespace(identifier, state))) {
    return;
  }
  const symbol = referencedSymbol(state.checker, identifier);
  const target = targetOfSymbol(state.registry, symbol);
  if (target === undefined || isDeclarationName(symbol, identifier) || isBenignAccess(identifier)) {
    return;
  }
  record({ target, state, kind: 'escape' });
}

function visit(node: TypeScript.Node, state: ReferenceState): void {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    handleJsx(node, state);
  }
  if (ts.isCallExpression(node)) {
    handleCall(node, state);
  }
  if (ts.isBinaryExpression(node)) {
    handleDefaultProps(node, state);
  }
  if (ts.isIdentifier(node)) {
    handleIdentifier(node, state);
  }
}

function childrenOf(node: TypeScript.Node): TypeScript.Node[] {
  return isSkippedSubtree(node) ? [] : syntaxChildren(node);
}

export function collectReferences(context: TargetContext, registry: Registry): void {
  for (const sourceFile of context.files) {
    const file = context.fileInfo.get(sourceFile.fileName);
    if (file === undefined) {
      continue;
    }
    const base = { ...context, registry, sourceFile, file };
    const consumed = new WeakSet<TypeScript.Node>();
    function consume(node: TypeScript.Node): void {
      consumed.add(node);
    }
    const state = { ...base, ...importedNames(base), consumed, consume };
    for (const node of depthFirst(sourceFile, childrenOf)) {
      visit(node, state);
    }
  }
}
