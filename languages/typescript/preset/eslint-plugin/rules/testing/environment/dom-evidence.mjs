import ts from 'typescript';
import { DOM_GLOBAL_NAMES } from './dom-globals.mjs';

const DOM_PACKAGES = [
  /^@testing-library\/(?!react-native$|jest-native$)/u,
  /^@[\w-]+\/testing-library(?:\/|$)/u,
  /^react-dom(?:\/(?!server|static)|$)/u,
  /^enzyme(?:-|$)/u,
  /^@vue\/test-utils$/u,
  /^@open-wc\//u,
  /^@angular\/core\/testing$/u,
  /^@angular\/platform-browser(?:-dynamic)?\/testing$/u,
  /^@storybook\/test(?:\/|$)/u,
  /^(?:jest|vitest)-axe(?:\/|$)/u,
];
const COMPONENT_FILE = /\.(?:vue|svelte|astro)$/u;
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
const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'self']);
const NODE_NAVIGATOR_MEMBERS = new Set([
  'hardwareConcurrency',
  'language',
  'languages',
  'platform',
  'userAgent',
]);
const TEST_API_OBJECTS = new Set(['vi', 'vitest', 'jest']);
const NAME_POSITIONS = [
  ['name', ts.isPropertyAccessExpression],
  ['right', ts.isQualifiedName],
  ['name', ts.isPropertyAssignment],
  ['name', ts.isMethodDeclaration],
  ['name', ts.isPropertyDeclaration],
  ['name', ts.isGetAccessorDeclaration],
  ['name', ts.isSetAccessorDeclaration],
  ['name', ts.isEnumMember],
  ['name', ts.isImportSpecifier],
  ['propertyName', ts.isImportSpecifier],
  ['name', ts.isExportSpecifier],
  ['propertyName', ts.isExportSpecifier],
  ['propertyName', ts.isBindingElement],
  ['label', ts.isLabeledStatement],
  ['tagName', ts.isJsxOpeningElement],
  ['tagName', ts.isJsxClosingElement],
  ['tagName', ts.isJsxSelfClosingElement],
  ['name', ts.isJsxAttribute],
];
const DECLARATIONS = [
  ts.isVariableDeclaration,
  ts.isParameter,
  ts.isFunctionDeclaration,
  ts.isClassDeclaration,
  ts.isBindingElement,
  ts.isImportClause,
  ts.isImportSpecifier,
  ts.isNamespaceImport,
  ts.isEnumDeclaration,
];

function isDomPackage(specifier) {
  return COMPONENT_FILE.test(specifier) || DOM_PACKAGES.some((pattern) => pattern.test(specifier));
}

function scriptKindOf(fileName) {
  if (/\.[jt]sx$/u.test(fileName)) return ts.ScriptKind.TSX;
  return /\.[cm]?js$/u.test(fileName) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

function isNamePosition(node) {
  return NAME_POSITIONS.some(
    ([property, test]) =>
      node.parent !== undefined && test(node.parent) && node.parent[property] === node,
  );
}

function declaredNames(sourceFile) {
  const names = new Set();
  function visit(node) {
    const name = DECLARATIONS.some((test) => test(node)) ? node.name : undefined;
    if (name !== undefined && ts.isIdentifier(name)) names.add(name.text);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

function isTypeOnlyImport(node) {
  const clause = node.importClause;
  if (clause === undefined) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  return (
    clause.name === undefined &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

function importedNames(node) {
  const bindings = node.importClause?.namedBindings;
  return bindings !== undefined && ts.isNamedImports(bindings)
    ? bindings.elements.map((element) => (element.propertyName ?? element.name).text)
    : [];
}

function stringArgument(node) {
  const [argument] = node.arguments;
  return argument !== undefined && ts.isStringLiteralLike(argument) ? argument.text : undefined;
}

function isNodeTestModuleMock(callee) {
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'module') return false;
  const receiver = callee.expression;
  return ts.isIdentifier(receiver)
    ? receiver.text === 'mock'
    : ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'mock';
}

function isTestApiModuleCall(callee) {
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    TEST_API_OBJECTS.has(callee.expression.text) &&
    MODULE_MOCKS.has(callee.name.text)
  );
}

function moduleCallSpecifier(node) {
  const callee = node.expression;
  if (callee.kind === ts.SyntaxKind.ImportKeyword) return stringArgument(node);
  if (ts.isIdentifier(callee)) return callee.text === 'require' ? stringArgument(node) : undefined;
  return isTestApiModuleCall(callee) || isNodeTestModuleMock(callee)
    ? stringArgument(node)
    : undefined;
}

function isOpaqueModuleCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  const loads =
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) && callee.text === 'require');
  return loads && node.arguments.length > 0 && stringArgument(node) === undefined;
}

function moduleSpecifierOf(node) {
  if (ts.isImportDeclaration(node)) {
    if (isTypeOnlyImport(node)) return undefined;
    const specifier = node.moduleSpecifier.text;
    const renders =
      specifier.startsWith('@storybook/') &&
      importedNames(node).some((name) => STORYBOOK_RENDERERS.has(name));
    return { specifier, forced: renders };
  }
  if (ts.isExportDeclaration(node)) {
    return node.moduleSpecifier === undefined || node.isTypeOnly
      ? undefined
      : { specifier: node.moduleSpecifier.text };
  }
  if (ts.isImportEqualsDeclaration(node)) {
    const reference = node.moduleReference;
    return node.isTypeOnly ||
      !ts.isExternalModuleReference(reference) ||
      !ts.isStringLiteralLike(reference.expression)
      ? undefined
      : { specifier: reference.expression.text };
  }
  if (ts.isCallExpression(node)) {
    const specifier = moduleCallSpecifier(node);
    return specifier === undefined ? undefined : { specifier };
  }
  return undefined;
}

function isTypePosition(node) {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return true;
  if (!ts.isTypeNode(node)) return false;
  const inClassExtends =
    ts.isExpressionWithTypeArguments(node) &&
    ts.isHeritageClause(node.parent) &&
    node.parent.token === ts.SyntaxKind.ExtendsKeyword &&
    ts.isClassLike(node.parent.parent);
  return !inClassExtends;
}

function memberAccess(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return { object: node.expression, name: node.name.text };
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return { object: node.expression, name: node.argumentExpression.text };
  }
  return undefined;
}

function isDomMember(node) {
  const access = memberAccess(node);
  if (access === undefined || !ts.isIdentifier(access.object)) return undefined;
  const { object, name } = access;
  if (GLOBAL_OBJECTS.has(object.text)) return DOM_GLOBAL_NAMES.has(name);
  return object.text === 'navigator' ? !NODE_NAVIGATOR_MEMBERS.has(name) : undefined;
}

export function scanDomEvidence(text, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(fileName),
  );
  const declared = declaredNames(sourceFile);
  const specifiers = [];
  const evidence = { usesDom: false, touchesDom: false, opaqueImport: false, specifiers };

  function visit(node) {
    if (isTypePosition(node)) return;
    const imported = moduleSpecifierOf(node);
    if (imported !== undefined) {
      if (imported.forced === true || isDomPackage(imported.specifier)) evidence.usesDom = true;
      specifiers.push(imported.specifier);
    }
    if (isOpaqueModuleCall(node)) evidence.opaqueImport = true;
    if (isDomMember(node) === true || isDomGlobalReference(node, declared)) {
      evidence.usesDom = true;
      evidence.touchesDom = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return evidence;
}

function isDomGlobalReference(node, declared) {
  if (!ts.isIdentifier(node) || declared.has(node.text) || isNamePosition(node)) return false;
  if (node.text === 'navigator')
    return !ts.isPropertyAccessExpression(node.parent) || node.parent.expression !== node;
  return DOM_GLOBAL_NAMES.has(node.text);
}
