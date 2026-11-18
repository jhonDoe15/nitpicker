import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';
import { packageOf } from './infrastructure-types.mts';

function calleeOf(decorator: TypeScript.Decorator): TypeScript.Node {
  const expression = decorator.expression;
  const callee = ts.isCallExpression(expression) ? expression.expression : expression;
  return ts.isPropertyAccessExpression(callee) ? callee.name : callee;
}

function originOf(
  checker: TypeScript.TypeChecker,
  identifier: TypeScript.Node,
): { readonly name: string; readonly packageName: string | undefined } | undefined {
  const symbol = checker.getSymbolAtLocation(identifier);
  const target =
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const declaration = target?.declarations?.[0];
  return target === undefined || declaration === undefined
    ? undefined
    : { name: target.name, packageName: packageOf(declaration.getSourceFile().fileName) };
}

export function decoratorNames(
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.Node,
  packages: readonly string[],
): string[] {
  const decorators = ts.canHaveDecorators(declaration) ? (ts.getDecorators(declaration) ?? []) : [];
  return decorators.flatMap((decorator) => {
    const origin = originOf(checker, calleeOf(decorator));
    return origin !== undefined &&
      packages.some((name) =>
        name.endsWith('/*')
          ? origin.packageName?.startsWith(name.slice(0, -1))
          : origin.packageName === name,
      )
      ? [origin.name]
      : [];
  });
}

export function isNestController(
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.Node,
): boolean {
  return decoratorNames(checker, declaration, ['@nestjs/common']).includes('Controller');
}
