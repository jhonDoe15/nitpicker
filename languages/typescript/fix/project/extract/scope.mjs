import { chainOf } from '../../../../../shared/traversal.mjs';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { descendants, roleOf, symbolAt } from './syntax.mjs';

const IMPORT_DECLARATIONS = [
  ts.isImportSpecifier,
  ts.isImportClause,
  ts.isNamespaceImport,
  ts.isImportEqualsDeclaration,
];

const TOP_LEVEL_DECLARATIONS = [
  ts.isFunctionDeclaration,
  ts.isClassDeclaration,
  ts.isEnumDeclaration,
  ts.isInterfaceDeclaration,
  ts.isTypeAliasDeclaration,
  ts.isModuleDeclaration,
];

const FORBIDDEN_KINDS = new Set([
  ts.SyntaxKind.ThisKeyword,
  ts.SyntaxKind.SuperKeyword,
  ts.SyntaxKind.MetaProperty,
  ts.SyntaxKind.YieldExpression,
  ts.SyntaxKind.JsxElement,
  ts.SyntaxKind.JsxSelfClosingElement,
  ts.SyntaxKind.JsxFragment,
  ts.SyntaxKind.Decorator,
]);

const TEXT_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);

const MULTILINE_TEXT = 'the code has a string or template literal that spans lines';

export function declarationsOf(symbol) {
  return typeof symbol === 'object' ? (symbol.declarations ?? []) : [];
}

export function isWithin(node, range) {
  return node.pos >= range.pos && node.end <= range.end;
}

function isInside(declaration, unit) {
  return (
    declaration !== unit &&
    declaration.getSourceFile() === unit.getSourceFile() &&
    isWithin(declaration, unit)
  );
}

function declaredOnlyWhere(symbol, test) {
  const declarations = declarationsOf(symbol);
  return declarations.length > 0 && declarations.every(test);
}

export function isLocalSymbol(symbol, unit) {
  return declaredOnlyWhere(symbol, (declaration) => isInside(declaration, unit));
}

export function isInRegion(symbol, region) {
  return declaredOnlyWhere(symbol, (declaration) => isWithin(declaration, region));
}

function bindingParent(node) {
  const inPattern =
    ts.isBindingElement(node) || ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node);
  return inPattern ? node.parent : undefined;
}

function isModuleVariable(node) {
  const statement = node.parent.parent;
  return ts.isVariableStatement(statement) && ts.isSourceFile(statement.parent);
}

function isModuleLevel(declaration) {
  if (IMPORT_DECLARATIONS.some((test) => test(declaration))) {
    return true;
  }
  const node = chainOf(declaration, bindingParent).at(-1);
  if (ts.isVariableDeclaration(node)) {
    return isModuleVariable(node);
  }
  return TOP_LEVEL_DECLARATIONS.some((test) => test(node)) && ts.isSourceFile(node.parent);
}

function reachesOuterScope(symbol, unit) {
  return declarationsOf(symbol).some(
    (declaration) =>
      declaration.getSourceFile() === unit.getSourceFile() &&
      !isInside(declaration, unit) &&
      !isModuleLevel(declaration),
  );
}

function referenceProblem(node, env) {
  const readsArguments = node.text === 'arguments';
  const outer = reachesOuterScope(symbolAt(node, env.checker), env.unit);
  return readsArguments || outer
    ? 'the code reads arguments or a variable of an enclosing scope'
    : undefined;
}

function nodeProblem(node, env) {
  if (FORBIDDEN_KINDS.has(node.kind)) {
    return 'the code uses this, super, JSX, decorators or a generator';
  }
  if (TEXT_KINDS.has(node.kind) && /[\r\n]/u.test(node.getText())) {
    return MULTILINE_TEXT;
  }
  const isValue = ts.isIdentifier(node) && ['reference', 'shorthand'].includes(roleOf(node));
  return isValue ? referenceProblem(node, env) : undefined;
}

export function templateProblem(roots, env) {
  const outsideHoles = roots
    .flatMap((root) => descendants(root))
    .filter((node) => !env.holeNodes.some((hole) => isWithin(node, hole)));
  return outsideHoles.map((node) => nodeProblem(node, env)).find((found) => found !== undefined);
}
