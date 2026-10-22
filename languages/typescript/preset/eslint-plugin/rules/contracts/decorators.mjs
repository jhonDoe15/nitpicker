import ts from 'typescript';
import { packageOf } from './infrastructure-types.mjs';

function calleeOf(decorator) {
  const expression = decorator.expression;
  const callee = ts.isCallExpression(expression) ? expression.expression : expression;
  return ts.isPropertyAccessExpression(callee) ? callee.name : callee;
}

function originOf(checker, identifier) {
  const symbol = checker.getSymbolAtLocation(identifier);
  const target =
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const declaration = target?.declarations?.[0];
  return declaration === undefined
    ? undefined
    : { name: target.name, packageName: packageOf(declaration.getSourceFile().fileName) };
}

export function decoratorNames(checker, declaration, packages) {
  const decorators = ts.canHaveDecorators(declaration) ? (ts.getDecorators(declaration) ?? []) : [];
  return decorators
    .map((decorator) => originOf(checker, calleeOf(decorator)))
    .filter(
      (origin) =>
        origin !== undefined &&
        packages.some((name) =>
          name.endsWith('/*')
            ? origin.packageName?.startsWith(name.slice(0, -1))
            : origin.packageName === name,
        ),
    )
    .map((origin) => origin.name);
}

export function isNestController(checker, declaration) {
  return decoratorNames(checker, declaration, ['@nestjs/common']).includes('Controller');
}
