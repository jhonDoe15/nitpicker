import ts from 'typescript';

const FORMAT_FLAGS =
  ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
const NULLISH_KEYWORDS = new Set([ts.SyntaxKind.UndefinedKeyword, ts.SyntaxKind.VoidKeyword]);

export function followAlias(checker, symbol) {
  return symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

export function entryOfSymbol({ registry, checker }, symbol) {
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

function isNullishTypeNode(node) {
  return (
    NULLISH_KEYWORDS.has(node.kind) ||
    (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword)
  );
}

function significantMembers(typeNode) {
  const pending = [typeNode];
  const kept = [];
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

function entryOfTypeNode(scope, typeNode) {
  const [only, ...rest] = significantMembers(typeNode);
  if (only === undefined || rest.length > 0 || !ts.isTypeReferenceNode(only)) {
    return undefined;
  }
  const name = ts.isQualifiedName(only.typeName) ? only.typeName.right : only.typeName;
  return entryOfSymbol(scope, scope.checker.getSymbolAtLocation(name));
}

function entryOfType(scope, type) {
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

export function entryOfNodeOrType(scope, { typeNode, type }) {
  return (
    (typeNode === undefined ? undefined : entryOfTypeNode(scope, typeNode)) ??
    (type === undefined ? undefined : entryOfType(scope, type))
  );
}

export function withoutGenerics(text) {
  let depth = 0;
  let result = '';
  for (const [index, char] of [...text].entries()) {
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

export function normalizedTypeText(checker, type) {
  const text = checker.typeToString(type, undefined, FORMAT_FLAGS).replaceAll(/\s+/gu, '');
  const plain = withoutGenerics(text).replaceAll(/\|undefined|undefined\|/gu, '');
  return plain === '' ? 'undefined' : plain;
}

export function isUntyped(checker, type) {
  return (
    (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0 ||
    checker.typeToString(type) === 'any[]'
  );
}
