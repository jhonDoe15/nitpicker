import { ts } from '../../../typescript-api/typescript-api.mjs';
import { exportsName } from '../edits/declines.mjs';

function variableWrapper(statement, name) {
  const [only] = statement.declarationList.declarations;
  const named = only !== undefined && ts.isIdentifier(only.name) && only.name.text === name;
  return named && only.initializer !== undefined
    ? { statement, fn: only.initializer, nameNode: only.name }
    : undefined;
}

function declarationWrapper(statement, name) {
  if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
    return { statement, fn: statement, nameNode: statement.name };
  }
  return ts.isVariableStatement(statement) ? variableWrapper(statement, name) : undefined;
}

export function wrapperDeclaration(sourceFile, name) {
  return sourceFile.statements
    .map((statement) => declarationWrapper(statement, name))
    .find((found) => found !== undefined);
}

function forwardedCallee(fn) {
  const body = fn.body;
  let expression = body;
  if (ts.isBlock(body)) {
    const [only] = body.statements;
    expression = only !== undefined && ts.isReturnStatement(only) ? only.expression : undefined;
  }
  const unwrapped =
    expression !== undefined && ts.isAwaitExpression(expression)
      ? expression.expression
      : expression;
  return unwrapped !== undefined &&
    ts.isCallExpression(unwrapped) &&
    ts.isIdentifier(unwrapped.expression)
    ? unwrapped.expression
    : undefined;
}

export function targetOrigin(project, { name, fn }) {
  const callee = forwardedCallee(fn);
  const checker = project.program.getTypeChecker();
  const symbol = callee === undefined ? undefined : checker.getSymbolAtLocation(callee);
  const declaration = symbol?.declarations?.[0];
  if (declaration !== undefined && ts.isImportSpecifier(declaration)) {
    const specifier = declaration.parent.parent.parent.moduleSpecifier.text;
    const module = project.resolve(specifier, name);
    return module === undefined
      ? undefined
      : {
          module,
          imported: (declaration.propertyName ?? declaration.name).text,
          local: callee.text,
        };
  }
  return declaration !== undefined && exportsName(project, name, callee.text)
    ? { module: name, imported: callee.text, local: callee.text }
    : undefined;
}
