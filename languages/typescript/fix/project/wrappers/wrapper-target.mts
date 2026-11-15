import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { exportsName } from '../edits/declines.mts';
import type { Project } from '../typed/project-types.mts';

export type WrapperDeclaration = {
  readonly statement: TypeScript.Statement;
  readonly fn: TypeScript.Node;
  readonly nameNode: TypeScript.Identifier;
};

export type TargetOrigin = {
  readonly module: string;
  readonly imported: string;
  readonly local: string;
};

const ts = typescriptApi();
function variableWrapper(
  statement: TypeScript.VariableStatement,
  name: string,
): WrapperDeclaration | undefined {
  const [only] = statement.declarationList.declarations;
  const named = only !== undefined && ts.isIdentifier(only.name) && only.name.text === name;
  return named && only.initializer !== undefined
    ? { statement, fn: only.initializer, nameNode: only.name }
    : undefined;
}

function declarationWrapper(
  statement: TypeScript.Statement,
  name: string,
): WrapperDeclaration | undefined {
  if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
    return { statement, fn: statement, nameNode: statement.name };
  }
  return ts.isVariableStatement(statement) ? variableWrapper(statement, name) : undefined;
}

export function wrapperDeclaration(
  sourceFile: TypeScript.SourceFile | undefined,
  name: string,
): WrapperDeclaration | undefined {
  return sourceFile?.statements
    .map((statement) => declarationWrapper(statement, name))
    .find((found) => found !== undefined);
}

function forwardedCallee(fn: TypeScript.Node): TypeScript.Identifier | undefined {
  const body =
    ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)
      ? fn.body
      : undefined;
  let expression: TypeScript.Node | undefined = body;
  if (body !== undefined && ts.isBlock(body)) {
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

export function targetOrigin(
  project: Project,
  { name, fn }: { readonly name: string; readonly fn: TypeScript.Node },
): TargetOrigin | undefined {
  const callee = forwardedCallee(fn);
  if (callee === undefined) {
    return undefined;
  }
  const checker = project.program.getTypeChecker();
  const symbol = checker.getSymbolAtLocation(callee);
  const declaration = symbol?.declarations?.[0];
  if (declaration !== undefined && ts.isImportSpecifier(declaration)) {
    const { moduleSpecifier } = declaration.parent.parent.parent;
    const module = ts.isStringLiteral(moduleSpecifier)
      ? project.resolve(moduleSpecifier.text, name)
      : undefined;
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
