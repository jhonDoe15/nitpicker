import type TypeScript from 'typescript';
import { parentOf } from '../../../../adapters/typed/typescript-program.mts';
import { lazyTypeScriptApi as untypedLazyTypeScriptApi } from '../../../../typescript-api/lazy-typescript-api.mjs';

const lazyTypeScriptApi: () => typeof TypeScript = untypedLazyTypeScriptApi;

export const ts = lazyTypeScriptApi();

export function variableNames(statement: TypeScript.VariableStatement): string[] {
  return statement.declarationList.declarations
    .map(({ name }) => name)
    .filter(ts.isIdentifier)
    .map(({ text }) => text);
}

export { parentOf };

export function aliasedSymbolAt(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): TypeScript.Symbol | undefined {
  const symbol = checker.getSymbolAtLocation(node);
  return symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

export function isType(value: unknown): value is TypeScript.Type {
  return typeof value === 'object' && value !== null && 'flags' in value && 'getSymbol' in value;
}

export function isReference(type: TypeScript.Type): type is TypeScript.TypeReference {
  return (
    'objectFlags' in type &&
    typeof type.objectFlags === 'number' &&
    (type.objectFlags & ts.ObjectFlags.Reference) !== 0
  );
}

export function withoutParentheses(node: TypeScript.Expression): TypeScript.Expression {
  const chain = [node];
  for (const current of chain) {
    if (ts.isParenthesizedExpression(current)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1) ?? node;
}

export function descendantsOf(root: TypeScript.Node): TypeScript.Node[] {
  const found = [root];
  for (const node of found) {
    node.forEachChild((child) => {
      found.push(child);
    });
  }
  return found.toSorted((first, second) => first.pos - second.pos);
}

export function wrappedExpression(
  expression: TypeScript.Expression,
): TypeScript.Expression | undefined {
  return ts.isParenthesizedExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isAwaitExpression(expression)
    ? expression.expression
    : undefined;
}

export function innermostExpression(
  expression: TypeScript.Expression,
  inner: (current: TypeScript.Expression) => TypeScript.Expression | undefined,
): TypeScript.Expression {
  const chain = [expression];
  for (const current of chain) {
    const next = wrappedExpression(current) ?? inner(current);
    if (next !== undefined) {
      chain.push(next);
    }
  }
  return chain.at(-1) ?? expression;
}
