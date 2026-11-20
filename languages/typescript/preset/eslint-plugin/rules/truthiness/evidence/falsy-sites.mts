import type TypeScript from 'typescript';
import { cachedValue } from '../../../../../../../shared/values/caching/cached-value.mts';
import { ts } from '../../typed/typescript-views.mts';

type Sites = Set<TypeScript.Node>;
type Scan = { readonly checker: TypeScript.TypeChecker; readonly sites: Sites };
type Call = TypeScript.CallExpression | TypeScript.NewExpression;
type Named = TypeScript.PropertyAssignment | TypeScript.BinaryExpression;
type Candidates = {
  readonly named: Map<string, Named[]>;
  readonly unnamed: Named[];
  readonly calls: Call[];
};
type Index = Scan & {
  readonly candidates: Candidates;
  readonly resolvedNames: Set<string>;
  readonly pending: { unnamed: boolean; calls: boolean };
};

const indexes = new WeakMap<TypeScript.Program, Index>();

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
  record(scan, scan.checker.getSymbolAtLocation(node.name));
  const name = propertyName(node.name);
  const type = scan.checker.getContextualType(node.parent);
  const contextual = type === undefined ? undefined : scan.checker.getNonNullableType(type);
  if (name !== undefined && contextual !== undefined) {
    record(scan, scan.checker.getPropertyOfType(contextual, name));
  }
}

function recordAssignment(scan: Scan, node: TypeScript.BinaryExpression): void {
  if (ts.isPropertyAccessExpression(node.left)) {
    record(scan, scan.checker.getSymbolAtLocation(node.left.name));
  }
}

function recordArguments(scan: Scan, node: Call): void {
  const parameters = scan.checker.getResolvedSignature(node)?.parameters ?? [];
  for (const [index, argument] of (node.arguments ?? []).entries()) {
    if (isFalsyLiteral(argument)) {
      record(scan, parameters[index]);
    }
  }
}

function assignedName(node: TypeScript.BinaryExpression): string | undefined {
  const isFalsyWrite =
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken && isFalsyLiteral(node.right);
  return isFalsyWrite && ts.isPropertyAccessExpression(node.left) ? node.left.name.text : undefined;
}

function keep(candidates: Candidates, name: string | undefined, node: Named): void {
  if (name === undefined) {
    candidates.unnamed.push(node);
    return;
  }
  const kept = candidates.named.get(name);
  if (kept === undefined) {
    candidates.named.set(name, [node]);
  } else {
    kept.push(node);
  }
}

function collect(candidates: Candidates, node: TypeScript.Node): void {
  if (ts.isPropertyAssignment(node)) {
    if (isFalsyLiteral(node.initializer)) {
      keep(candidates, propertyName(node.name), node);
    }
  } else if (ts.isBinaryExpression(node)) {
    const name = assignedName(node);
    if (name !== undefined) {
      keep(candidates, name, node);
    }
  } else if (
    (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
    node.arguments?.some((argument) => isFalsyLiteral(argument)) === true
  ) {
    candidates.calls.push(node);
  }
}

function candidatesIn(program: TypeScript.Program): Candidates {
  const candidates: Candidates = { named: new Map(), unnamed: [], calls: [] };
  for (const file of program.getSourceFiles().filter(isProjectFile)) {
    const pending: TypeScript.Node[] = [file];
    for (const node of pending) {
      collect(candidates, node);
      ts.forEachChild(node, (child) => {
        pending.push(child);
      });
    }
  }
  return candidates;
}

function buildIndex(program: TypeScript.Program): Index {
  return {
    checker: program.getTypeChecker(),
    sites: new Set(),
    candidates: candidatesIn(program),
    resolvedNames: new Set(),
    pending: { unnamed: true, calls: true },
  };
}

function resolveAll(index: Index, nodes: readonly Named[]): void {
  for (const node of nodes) {
    if (ts.isPropertyAssignment(node)) {
      recordProperty(index, node);
    } else {
      recordAssignment(index, node);
    }
  }
}

function resolveNamed(index: Index, name: string): void {
  if (!index.resolvedNames.has(name)) {
    index.resolvedNames.add(name);
    resolveAll(index, index.candidates.named.get(name) ?? []);
  }
  if (index.pending.unnamed) {
    index.pending.unnamed = false;
    resolveAll(index, index.candidates.unnamed);
  }
}

function resolveCalls(index: Index): void {
  if (!index.pending.calls) {
    return;
  }
  index.pending.calls = false;
  for (const call of index.candidates.calls) {
    recordArguments(index, call);
  }
}

function isMemberDeclaration(declaration: TypeScript.Declaration): boolean {
  return (
    ts.isPropertySignature(declaration) ||
    ts.isPropertyDeclaration(declaration) ||
    ts.isPropertyAssignment(declaration)
  );
}

/**
 * Whether `""`, `0` or `false` is written to `symbol` somewhere in the project: as a property of
 * an object literal, by assignment, or as a call argument. The places that can write to a symbol
 * are found by syntax once per program; the type checker resolves only those that write a property
 * of the symbol's name, and the calls only when the symbol is not a plain member.
 */
export function isSetToFalsy(
  program: TypeScript.Program,
  symbol: TypeScript.Symbol | undefined,
): boolean {
  const declarations = symbol?.declarations ?? [];
  if (symbol === undefined || declarations.length === 0) {
    return false;
  }
  const index = cachedValue(indexes, program, buildIndex);
  resolveNamed(index, symbol.name);
  if (!declarations.every(isMemberDeclaration)) {
    resolveCalls(index);
  }
  return declarations.some((declaration) => index.sites.has(declaration));
}
