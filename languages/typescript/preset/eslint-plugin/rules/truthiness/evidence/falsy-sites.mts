import type TypeScript from 'typescript';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';
import { cachedValue } from '../../../../../../../shared/values/caching/cached-value.mts';
import { ts } from '../../typed/typescript-views.mts';

type Sites = Set<TypeScript.Node>;
type Scan = { readonly checker: TypeScript.TypeChecker; readonly sites: Sites };

const indexes = new WeakMap<TypeScript.Program, Sites>();

function isFalsyLiteral(node: TypeScript.Node | undefined): boolean {
  return (
    node !== undefined &&
    ((ts.isStringLiteralLike(node) && node.text === '') ||
      (ts.isNumericLiteral(node) && Number(node.text) === 0) ||
      node.kind === ts.SyntaxKind.FalseKeyword)
  );
}

function isProjectFile(file: TypeScript.SourceFile): boolean {
  return !(
    file.isDeclarationFile || file.fileName.replaceAll('\\', '/').includes('/node_modules/')
  );
}

function record(scan: Scan, symbol: TypeScript.Symbol | undefined): void {
  for (const declaration of symbol?.declarations ?? []) {
    scan.sites.add(declaration);
  }
}

function propertyName(name: TypeScript.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
}

function recordProperty(scan: Scan, node: TypeScript.PropertyAssignment): void {
  if (!isFalsyLiteral(node.initializer)) {
    return;
  }
  record(scan, scan.checker.getSymbolAtLocation(node.name));
  const name = propertyName(node.name);
  const type = scan.checker.getContextualType(node.parent);
  const contextual = type === undefined ? undefined : scan.checker.getNonNullableType(type);
  if (name !== undefined && contextual !== undefined) {
    record(scan, scan.checker.getPropertyOfType(contextual, name));
  }
}

function recordAssignment(scan: Scan, node: TypeScript.BinaryExpression): void {
  if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken || !isFalsyLiteral(node.right)) {
    return;
  }
  if (ts.isPropertyAccessExpression(node.left)) {
    record(scan, scan.checker.getSymbolAtLocation(node.left.name));
  }
}

function recordArguments(
  scan: Scan,
  node: TypeScript.CallExpression | TypeScript.NewExpression,
): void {
  const passed = node.arguments ?? [];
  if (!passed.some((argument) => isFalsyLiteral(argument))) {
    return;
  }
  const parameters = scan.checker.getResolvedSignature(node)?.parameters ?? [];
  for (const [index, argument] of passed.entries()) {
    if (isFalsyLiteral(argument)) {
      record(scan, parameters[index]);
    }
  }
}

function recordNode(scan: Scan, node: TypeScript.Node): void {
  if (ts.isPropertyAssignment(node)) {
    recordProperty(scan, node);
  } else if (ts.isBinaryExpression(node)) {
    recordAssignment(scan, node);
  } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    recordArguments(scan, node);
  }
}

function buildSites(program: TypeScript.Program): Sites {
  const scan: Scan = { checker: program.getTypeChecker(), sites: new Set() };
  for (const file of program.getSourceFiles().filter(isProjectFile)) {
    const pending: TypeScript.Node[] = [file];
    for (const node of pending) {
      recordNode(scan, node);
      appendAll(pending, node.getChildren(file));
    }
  }
  return scan.sites;
}

export function isSetToFalsy(
  program: TypeScript.Program,
  symbol: TypeScript.Symbol | undefined,
): boolean {
  const sites = cachedValue(indexes, program, buildSites);
  return symbol?.declarations?.some((declaration) => sites.has(declaration)) === true;
}
