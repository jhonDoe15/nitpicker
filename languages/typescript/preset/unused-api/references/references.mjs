import ts from 'typescript';
import { depthFirst } from '../../../../../shared/traversal.mjs';
import { syntaxChildren } from '../../syntax/children.mjs';
import { isWrapperCall } from '../syntax/candidates.mjs';
import { wrappedReference } from '../syntax/declarations.mjs';
import {
  allPasses,
  calleeName,
  emptyPasses,
  jsxPasses,
  objectPasses,
  unwrapExpression,
} from '../syntax/passes.mjs';
import { referencedSymbol, targetOf, targetOfSymbol } from '../syntax/resolve.mjs';
import { handleDefaultProps, handleElementCall, isElementCall } from './element-calls.mjs';
import { handleModuleLoad, isModuleLoad } from './module-loads.mjs';
import {
  consume,
  escapeModule,
  leftmost,
  mayBeTarget,
  record,
  referencedComponent,
} from './state.mjs';

const FORWARDING_MEMBERS = new Set(['call', 'apply', 'bind']);

function isSkippedSubtree(node) {
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

function importBindings(statement) {
  const clause = statement.importClause;
  const bindings = clause?.namedBindings;
  const named =
    bindings && ts.isNamedImports(bindings) ? bindings.elements.map(({ name }) => name) : [];
  return [clause?.name, ...named].filter(Boolean);
}

function importedNames({ sourceFile, ...state }) {
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

function handleJsx(node, state) {
  const target = referencedComponent(node.tagName, state);
  if (target === undefined) return;
  consume(node.tagName, state);
  record({ target, state, kind: 'call', passes: jsxPasses(node) });
}

function optionsPasses(call, index) {
  const leading = call.arguments.slice(0, index + 1);
  if (leading.some(ts.isSpreadElement)) return allPasses();
  return leading.length > index ? objectPasses(leading[index]) : emptyPasses();
}

function handleDirectCall(call, callee, state) {
  if (!mayBeTarget(callee, state)) return;
  const target = targetOf(state, callee);
  if (target === undefined) return;
  consume(callee, state);
  const passes = target.kind === 'function' ? optionsPasses(call, target.index) : allPasses();
  record({ target, state, kind: 'call', passes });
}

function consumeWrapped(call, state) {
  const parent = call.parent;
  const isAlias = ts.isVariableDeclaration(parent) || ts.isExportAssignment(parent);
  const reference = isAlias ? wrappedReference(call) : undefined;
  if (reference !== undefined) consume(reference, state);
}

function handleCall(call, state) {
  const callee = unwrapExpression(call.expression);
  const name = calleeName(callee);
  if (isModuleLoad(callee)) handleModuleLoad(call, callee, state);
  else if (isElementCall(name)) handleElementCall(call, name, state);
  else handleDirectCall(call, callee, state);
  if (isWrapperCall(call)) consumeWrapped(call, state);
}

function isBenignAccess(identifier) {
  const parent = identifier.parent;
  return (
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === identifier &&
    !FORWARDING_MEMBERS.has(parent.name.text)
  );
}

function isDeclarationName(symbol, identifier) {
  return (symbol.declarations ?? []).some(
    (declaration) => ts.getNameOfDeclaration(declaration) === identifier,
  );
}

function handleNamespace(identifier, state) {
  if (isBenignAccess(identifier) || identifier.parent.kind === ts.SyntaxKind.NamespaceImport)
    return;
  const symbol = referencedSymbol(state.checker, identifier);
  if (symbol !== undefined && symbol.flags & ts.SymbolFlags.ValueModule)
    escapeModule(symbol, state);
}

function viaNamespace(identifier, state) {
  const isMember =
    ts.isPropertyAccessExpression(identifier.parent) && identifier.parent.name === identifier;
  const root = isMember ? leftmost(identifier.parent) : undefined;
  return root !== undefined && ts.isIdentifier(root) && state.namespaces.has(root.text);
}

function handleIdentifier(identifier, state) {
  if (state.consumed.has(identifier) || ts.isExportAssignment(identifier.parent)) return;
  if (state.namespaces.has(identifier.text)) handleNamespace(identifier, state);
  if (!state.names.has(identifier.text) && !viaNamespace(identifier, state)) return;
  const symbol = referencedSymbol(state.checker, identifier);
  const target = targetOfSymbol(state.registry, symbol);
  if (target === undefined || isDeclarationName(symbol, identifier) || isBenignAccess(identifier))
    return;
  record({ target, state, kind: 'escape' });
}

function visit(node, state) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) handleJsx(node, state);
  if (ts.isCallExpression(node)) handleCall(node, state);
  if (ts.isBinaryExpression(node)) handleDefaultProps(node, state);
  if (ts.isIdentifier(node)) handleIdentifier(node, state);
}

function childrenOf(node) {
  return isSkippedSubtree(node) ? [] : syntaxChildren(node);
}

/** Records, on each target, how every file in the program calls it, renders it or lets it escape. */
export function collectReferences(context, registry) {
  for (const sourceFile of context.files) {
    const base = {
      ...context,
      registry,
      sourceFile,
      file: context.fileInfo.get(sourceFile.fileName),
    };
    const state = { ...base, ...importedNames(base), consumed: new WeakSet() };
    for (const node of depthFirst(sourceFile, childrenOf)) visit(node, state);
  }
}
