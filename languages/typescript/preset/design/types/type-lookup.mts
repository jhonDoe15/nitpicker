import type TypeScript from 'typescript';
import { ts } from '../syntax/typed.mts';
import type { Registry, TypeEntry } from '../design-types.mts';

type Scope = { readonly registry: Registry; readonly checker: TypeScript.TypeChecker };

const FORMAT_FLAGS =
  ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
const NULLISH_KEYWORDS = new Set([ts.SyntaxKind.UndefinedKeyword, ts.SyntaxKind.VoidKeyword]);

export function followAlias(
  checker: TypeScript.TypeChecker,
  symbol: TypeScript.Symbol | undefined,
): TypeScript.Symbol | undefined {
  return symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

export function entryOfSymbol(
  { registry, checker }: Scope,
  symbol: TypeScript.Symbol | undefined,
): TypeEntry | undefined {
  const target = followAlias(checker, symbol);
  for (const declaration of target?.declarations ?? []) {
    const entry =
      registry.typeByNode.get(declaration) ??
      (ts.isEnumMember(declaration) ? registry.typeByNode.get(declaration.parent) : undefined);
    if (entry !== undefined) {
      return entry;
    }
  }
  return undefined;
}

function isNullishTypeNode(node: TypeScript.TypeNode): boolean {
  return (
    NULLISH_KEYWORDS.has(node.kind) ||
    (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword)
  );
}

function significantMembers(typeNode: TypeScript.TypeNode): TypeScript.TypeNode[] {
  const pending = [typeNode];
  const kept: TypeScript.TypeNode[] = [];
  for (const node of pending) {
    if (ts.isParenthesizedTypeNode(node)) {
      pending.push(node.type);
    } else if (ts.isUnionTypeNode(node)) {
      pending.push(...node.types);
    } else if (!isNullishTypeNode(node)) {
      kept.push(node);
    }
  }
  return kept;
}

function entryOfTypeNode(scope: Scope, typeNode: TypeScript.TypeNode): TypeEntry | undefined {
  const [only, ...rest] = significantMembers(typeNode);
  if (only === undefined || rest.length > 0 || !ts.isTypeReferenceNode(only)) {
    return undefined;
  }
  const name = ts.isQualifiedName(only.typeName) ? only.typeName.right : only.typeName;
  return entryOfSymbol(scope, scope.checker.getSymbolAtLocation(name));
}

function entryOfType(scope: Scope, type: TypeScript.Type): TypeEntry | undefined {
  const plain = scope.checker.getNonNullableType(type);
  const symbols = [plain.aliasSymbol, plain.symbol];
  for (const symbol of symbols) {
    const entry = entryOfSymbol(scope, symbol);
    if (entry !== undefined) {
      return entry;
    }
  }
  return undefined;
}

export function entryOfNodeOrType(
  scope: Scope,
  {
    typeNode,
    type,
  }: { typeNode: TypeScript.TypeNode | undefined; type: TypeScript.Type | undefined },
): TypeEntry | undefined {
  return (
    (typeNode === undefined ? undefined : entryOfTypeNode(scope, typeNode)) ??
    (type === undefined ? undefined : entryOfType(scope, type))
  );
}

export function withoutGenerics(text: string): string {
  let depth = 0;
  let result = '';
  for (const [index, char] of Array.from(text).entries()) {
    if (char === '<') {
      depth += 1;
    } else if (char === '>' && text[index - 1] !== '=' && depth > 0) {
      depth -= 1;
    } else if (depth === 0) {
      result += char;
    }
  }
  return result;
}

export function normalizedTypeText(checker: TypeScript.TypeChecker, type: TypeScript.Type): string {
  const text = checker.typeToString(type, undefined, FORMAT_FLAGS).replaceAll(/\s+/gu, '');
  const plain = withoutGenerics(text).replaceAll(/\|undefined|undefined\|/gu, '');
  return plain === '' ? 'undefined' : plain;
}

export function isUntyped(checker: TypeScript.TypeChecker, type: TypeScript.Type): boolean {
  return (
    (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0 ||
    checker.typeToString(type) === 'any[]'
  );
}
