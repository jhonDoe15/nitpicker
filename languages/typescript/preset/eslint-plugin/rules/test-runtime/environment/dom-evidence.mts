import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';
import { DOM_GLOBAL_NAMES } from './dom-globals.mts';
import { isOpaqueModuleCall, moduleSpecifierOf } from './module-specifiers.mts';

type Node = TypeScript.Node;
type Declaration =
  | TypeScript.VariableDeclaration
  | TypeScript.ParameterDeclaration
  | TypeScript.FunctionDeclaration
  | TypeScript.ClassDeclaration
  | TypeScript.BindingElement
  | TypeScript.ImportClause
  | TypeScript.ImportSpecifier
  | TypeScript.NamespaceImport
  | TypeScript.EnumDeclaration;
type MemberAccess = { readonly object: TypeScript.Expression; readonly name: string };

export type DomEvidence = {
  usesDom: boolean;
  touchesDom: boolean;
  opaqueImport: boolean;
  readonly specifiers: string[];
};

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
const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'self']);
const NODE_NAVIGATOR_MEMBERS = new Set([
  'hardwareConcurrency',
  'language',
  'languages',
  'platform',
  'userAgent',
]);
const PROPERTY_NAME = 'propertyName';
const TAG_NAME = 'tagName';
const NAME_POSITIONS: readonly (readonly [string, (node: Node) => boolean])[] = [
  ['name', ts.isPropertyAccessExpression],
  ['right', ts.isQualifiedName],
  ['name', ts.isPropertyAssignment],
  ['name', ts.isMethodDeclaration],
  ['name', ts.isPropertyDeclaration],
  ['name', ts.isGetAccessorDeclaration],
  ['name', ts.isSetAccessorDeclaration],
  ['name', ts.isEnumMember],
  ['name', ts.isImportSpecifier],
  [PROPERTY_NAME, ts.isImportSpecifier],
  ['name', ts.isExportSpecifier],
  [PROPERTY_NAME, ts.isExportSpecifier],
  [PROPERTY_NAME, ts.isBindingElement],
  ['label', ts.isLabeledStatement],
  [TAG_NAME, ts.isJsxOpeningElement],
  [TAG_NAME, ts.isJsxClosingElement],
  [TAG_NAME, ts.isJsxSelfClosingElement],
  ['name', ts.isJsxAttribute],
];
const DECLARATIONS: readonly ((node: Node) => node is Declaration)[] = [
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

function isDomPackage(specifier: string): boolean {
  return COMPONENT_FILE.test(specifier) || DOM_PACKAGES.some((pattern) => pattern.test(specifier));
}

function scriptKindOf(fileName: string): TypeScript.ScriptKind {
  if (/\.[jt]sx$/u.test(fileName)) {
    return ts.ScriptKind.TSX;
  }
  return /\.[cm]?js$/u.test(fileName) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

function parentOf(node: Node): Node | undefined {
  return node.parent;
}

function isNamePosition(node: Node): boolean {
  return NAME_POSITIONS.some(([property, test]) => {
    const parent = parentOf(node);
    return parent !== undefined && test(parent) && Reflect.get(parent, property) === node;
  });
}

function isDeclaration(node: Node): node is Declaration {
  return DECLARATIONS.some((test) => test(node));
}

function declaredNames(sourceFile: TypeScript.SourceFile): Set<string> {
  const names = new Set<string>();
  function visit(node: Node): void {
    const name = isDeclaration(node) ? node.name : undefined;
    if (name !== undefined && ts.isIdentifier(name)) {
      names.add(name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

function isTypePosition(node: Node): boolean {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
    return true;
  }
  if (!ts.isTypeNode(node)) {
    return false;
  }
  const inClassExtends =
    ts.isExpressionWithTypeArguments(node) &&
    ts.isHeritageClause(node.parent) &&
    node.parent.token === ts.SyntaxKind.ExtendsKeyword &&
    ts.isClassLike(node.parent.parent);
  return !inClassExtends;
}

function memberAccess(node: Node): MemberAccess | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return { object: node.expression, name: node.name.text };
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return { object: node.expression, name: node.argumentExpression.text };
  }
  return undefined;
}

function isDomMember(node: Node): boolean {
  const access = memberAccess(node);
  if (access === undefined || !ts.isIdentifier(access.object)) {
    return false;
  }
  const { object, name } = access;
  if (GLOBAL_OBJECTS.has(object.text)) {
    return DOM_GLOBAL_NAMES.has(name);
  }
  return object.text === 'navigator' && !NODE_NAVIGATOR_MEMBERS.has(name);
}

export function scanDomEvidence(text: string, fileName: string): DomEvidence {
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(fileName),
  );
  const declared = declaredNames(sourceFile);
  const specifiers: string[] = [];
  const evidence: DomEvidence = {
    usesDom: false,
    touchesDom: false,
    opaqueImport: false,
    specifiers,
  };

  function visit(node: Node): void {
    if (isTypePosition(node)) {
      return;
    }
    const imported = moduleSpecifierOf(node);
    if (imported !== undefined) {
      if (imported.forced || isDomPackage(imported.specifier)) {
        evidence.usesDom = true;
      }
      specifiers.push(imported.specifier);
    }
    if (isOpaqueModuleCall(node)) {
      evidence.opaqueImport = true;
    }
    if (isDomMember(node) || isDomGlobalReference(node, declared)) {
      evidence.usesDom = true;
      evidence.touchesDom = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return evidence;
}

function isDomGlobalReference(node: Node, declared: ReadonlySet<string>): boolean {
  if (!ts.isIdentifier(node) || declared.has(node.text) || isNamePosition(node)) {
    return false;
  }
  if (node.text === 'navigator') {
    return !ts.isPropertyAccessExpression(node.parent) || node.parent.expression !== node;
  }
  return DOM_GLOBAL_NAMES.has(node.text);
}
