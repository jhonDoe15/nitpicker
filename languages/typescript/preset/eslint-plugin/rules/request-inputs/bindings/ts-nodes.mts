import type { TSESLint } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';
import { nameOf, topLevelImport, type ImportBinding } from './import-bindings.mts';

export type DecoratorCall = {
  readonly name: string | undefined;
  readonly base: TypeScript.Identifier | undefined;
  readonly arguments: TypeScript.Expression[];
};
type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;
type Wrapper =
  | TypeScript.ParenthesizedExpression
  | TypeScript.AsExpression
  | TypeScript.SatisfiesExpression
  | TypeScript.NonNullExpression;

const MAX_ALIAS_DEPTH = 4;

const SCRIPT_KINDS: readonly (readonly [RegExp, TypeScript.ScriptKind])[] = [
  [/\.tsx$/, ts.ScriptKind.TSX],
  [/\.[cm]?js$/, ts.ScriptKind.JS],
  [/\.jsx$/, ts.ScriptKind.JSX],
];

function scriptKind(filename: string): TypeScript.ScriptKind {
  return SCRIPT_KINDS.find(([pattern]) => pattern.test(filename))?.[1] ?? ts.ScriptKind.TS;
}

export function sourceOf(context: Context): {
  readonly file: TypeScript.SourceFile;
  readonly checker: TypeScript.TypeChecker | undefined;
} {
  const { sourceCode, filename } = context;
  const services = sourceCode.parserServices;
  const program = services?.program ?? undefined;
  const mapped = services?.esTreeNodeToTSNodeMap?.get(sourceCode.ast);
  const file =
    mapped !== undefined && ts.isSourceFile(mapped) && mapped.text === sourceCode.text
      ? mapped
      : ts.createSourceFile(
          filename,
          sourceCode.text,
          ts.ScriptTarget.Latest,
          true,
          scriptKind(filename),
        );
  return { file, checker: mapped === file ? program?.getTypeChecker() : undefined };
}

export function baseIdentifier(node: TypeScript.Node): TypeScript.Identifier | undefined {
  const chain = [node];
  for (const current of chain) {
    if (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) {
      chain.push(current.expression);
    }
  }
  const base = chain.at(-1);
  return base !== undefined && ts.isIdentifier(base) ? base : undefined;
}

function declaredNames(
  statement: TypeScript.Statement,
): (readonly [string | undefined, TypeScript.Node])[] {
  if (
    (ts.isClassDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
    statement.name !== undefined
  ) {
    return [[statement.name.text, statement]];
  }
  return ts.isVariableStatement(statement)
    ? statement.declarationList.declarations.map(
        (entry): readonly [string | undefined, TypeScript.Node] => [nameOf(entry.name), entry],
      )
    : [];
}

function topLevelDeclaration(
  file: TypeScript.SourceFile,
  name: string,
): TypeScript.Node | undefined {
  for (const statement of file.statements) {
    const found = declaredNames(statement).find(([declared]) => declared === name);
    if (found !== undefined) {
      return found[1];
    }
  }
  return undefined;
}

export function importOf(identifier: TypeScript.Identifier): ImportBinding | undefined {
  return isShadowed(identifier)
    ? undefined
    : topLevelImport(identifier.getSourceFile(), identifier.text);
}

function declaresName(node: TypeScript.Node, name: string): boolean {
  const parameters: readonly TypeScript.ParameterDeclaration[] = ts.isFunctionLike(node)
    ? node.parameters
    : [];
  if (parameters.some((parameter) => nameOf(parameter.name) === name)) {
    return true;
  }
  const statements = ts.isBlock(node) ? node.statements : [];
  return statements.some(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some((entry) => nameOf(entry.name) === name),
  );
}

function isShadowed(identifier: TypeScript.Identifier): boolean {
  const ancestors: (TypeScript.Node | undefined)[] = [identifier.parent];
  for (const node of ancestors) {
    if (node !== undefined && !ts.isSourceFile(node)) {
      ancestors.push(node.parent);
    }
  }
  return ancestors.some((node) => node !== undefined && declaresName(node, identifier.text));
}

export function isFromPackage(
  identifier: TypeScript.Identifier | undefined,
  packages: readonly string[],
): boolean {
  const source = identifier === undefined ? undefined : importOf(identifier)?.source;
  return (
    source !== undefined &&
    packages.some((name) => source === name || source.startsWith(`${name}/`))
  );
}

function localDeclaration(identifier: TypeScript.Identifier): TypeScript.Node | undefined {
  return isShadowed(identifier)
    ? undefined
    : topLevelDeclaration(identifier.getSourceFile(), identifier.text);
}

function checkedDeclaration(
  checker: TypeScript.TypeChecker,
  identifier: TypeScript.Node,
): TypeScript.Declaration | undefined {
  const symbol = checker.getSymbolAtLocation(identifier);
  const target =
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return (target?.declarations ?? []).find(
    (declaration) =>
      ts.isClassDeclaration(declaration) ||
      ts.isVariableDeclaration(declaration) ||
      ts.isTypeAliasDeclaration(declaration),
  );
}

export function declarationOf(
  identifier: TypeScript.Identifier,
  checker: TypeScript.TypeChecker | undefined,
): TypeScript.Node | undefined {
  const checked = checker === undefined ? undefined : checkedDeclaration(checker, identifier);
  return checked ?? localDeclaration(identifier);
}

function isWrapper(node: TypeScript.Node): node is Wrapper {
  return (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  );
}

function aliasTarget(
  identifier: TypeScript.Identifier,
  checker: TypeScript.TypeChecker | undefined,
): TypeScript.Expression | undefined {
  const declaration = declarationOf(identifier, checker);
  return declaration !== undefined && ts.isVariableDeclaration(declaration)
    ? declaration.initializer
    : undefined;
}

function nextExpression(
  node: TypeScript.Node,
  checker: TypeScript.TypeChecker | undefined,
  depth: number,
): TypeScript.Node | undefined {
  if (isWrapper(node)) {
    return node.expression;
  }
  return ts.isIdentifier(node) && depth <= MAX_ALIAS_DEPTH * 2
    ? aliasTarget(node, checker)
    : undefined;
}

export function resolvedExpression(
  node: TypeScript.Node | undefined,
  checker: TypeScript.TypeChecker | undefined,
): TypeScript.Node | undefined {
  const chain: TypeScript.Node[] = node === undefined ? [] : [node];
  for (const current of chain) {
    const next = nextExpression(current, checker, chain.length);
    if (next !== undefined) {
      chain.push(next);
    }
  }
  const last = chain.at(-1);
  return last === undefined || ts.isIdentifier(last) ? undefined : last;
}

export function decoratorsOf(node: TypeScript.Node): readonly TypeScript.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function exportedName(identifier: TypeScript.Node): string | undefined {
  const imported = ts.isIdentifier(identifier) ? importOf(identifier)?.imported : undefined;
  return imported === undefined || imported === '*' || imported === 'default'
    ? nameOf(identifier)
    : imported;
}

export function decoratorCall(decorator: TypeScript.Decorator): DecoratorCall {
  const { expression } = decorator;
  const callee = ts.isCallExpression(expression) ? expression.expression : expression;
  const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : exportedName(callee);
  return {
    name,
    base: baseIdentifier(callee),
    arguments: ts.isCallExpression(expression) ? [...expression.arguments] : [],
  };
}
