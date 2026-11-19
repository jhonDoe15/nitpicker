import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';

type Node = TypeScript.Node;

export type ModuleImport = { readonly specifier: string; readonly forced: boolean };

const STORYBOOK_RENDERERS = new Set(['composeStories', 'composeStory']);
const MODULE_MOCKS = new Set([
  'mock',
  'doMock',
  'importActual',
  'importMock',
  'requireActual',
  'requireMock',
  'unstable_mockModule',
  'setMock',
]);
const TEST_API_OBJECTS = new Set(['vi', 'vitest', 'jest']);

function isTypeOnlyImport(node: TypeScript.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined) {
    return false;
  }
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) {
    return true;
  }
  const bindings = clause.namedBindings;
  return (
    clause.name === undefined &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

function importedNames(node: TypeScript.ImportDeclaration): string[] {
  const bindings = node.importClause?.namedBindings;
  return bindings !== undefined && ts.isNamedImports(bindings)
    ? bindings.elements.map((element) => (element.propertyName ?? element.name).text)
    : [];
}

function stringArgument(node: TypeScript.CallExpression): string | undefined {
  const [argument] = node.arguments;
  return argument !== undefined && ts.isStringLiteralLike(argument) ? argument.text : undefined;
}

function isNodeTestModuleMock(callee: TypeScript.Expression): boolean {
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'module') {
    return false;
  }
  const receiver = callee.expression;
  return ts.isIdentifier(receiver)
    ? receiver.text === 'mock'
    : ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'mock';
}

function isTestApiModuleCall(callee: TypeScript.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    TEST_API_OBJECTS.has(callee.expression.text) &&
    MODULE_MOCKS.has(callee.name.text)
  );
}

function moduleCallSpecifier(node: TypeScript.CallExpression): string | undefined {
  const callee = node.expression;
  if (callee.kind === ts.SyntaxKind.ImportKeyword) {
    return stringArgument(node);
  }
  if (ts.isIdentifier(callee)) {
    return callee.text === 'require' ? stringArgument(node) : undefined;
  }
  return isTestApiModuleCall(callee) || isNodeTestModuleMock(callee)
    ? stringArgument(node)
    : undefined;
}

export function isOpaqueModuleCall(node: Node): boolean {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  const callee = node.expression;
  const loads =
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) && callee.text === 'require');
  return loads && node.arguments.length > 0 && stringArgument(node) === undefined;
}

function importSource(node: TypeScript.ImportDeclaration): ModuleImport | undefined {
  if (isTypeOnlyImport(node) || !ts.isStringLiteralLike(node.moduleSpecifier)) {
    return undefined;
  }
  const specifier = node.moduleSpecifier.text;
  const renders =
    specifier.startsWith('@storybook/') &&
    importedNames(node).some((name) => STORYBOOK_RENDERERS.has(name));
  return { specifier, forced: renders };
}

function exportSource(node: TypeScript.ExportDeclaration): ModuleImport | undefined {
  return node.moduleSpecifier === undefined ||
    node.isTypeOnly ||
    !ts.isStringLiteralLike(node.moduleSpecifier)
    ? undefined
    : { specifier: node.moduleSpecifier.text, forced: false };
}

function importEqualsSource(node: TypeScript.ImportEqualsDeclaration): ModuleImport | undefined {
  const reference = node.moduleReference;
  return node.isTypeOnly ||
    !ts.isExternalModuleReference(reference) ||
    !ts.isStringLiteralLike(reference.expression)
    ? undefined
    : { specifier: reference.expression.text, forced: false };
}

export function moduleSpecifierOf(node: Node): ModuleImport | undefined {
  if (ts.isImportDeclaration(node)) {
    return importSource(node);
  }
  if (ts.isExportDeclaration(node)) {
    return exportSource(node);
  }
  if (ts.isImportEqualsDeclaration(node)) {
    return importEqualsSource(node);
  }
  if (ts.isCallExpression(node)) {
    const specifier = moduleCallSpecifier(node);
    return specifier === undefined ? undefined : { specifier, forced: false };
  }
  return undefined;
}
