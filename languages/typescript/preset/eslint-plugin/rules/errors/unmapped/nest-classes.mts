import type TypeScript from 'typescript';
import { aliasedSymbolAt, ts } from '../../typed/typescript-views.mts';
import { decoratorsOf } from '../../request-inputs/bindings/ts-nodes.mts';

type ClassSearch = {
  readonly found?: TypeScript.ClassLikeDeclaration | undefined;
  readonly next?: TypeScript.Node | undefined;
};
type Chain = readonly TypeScript.ClassLikeDeclaration[];

const MAX_ANCESTORS = 12;
const ALIAS_ROUNDS = Array.from({ length: 3 });
const FRAMEWORK_STATUS_CLASSES = new Set([
  'HttpException',
  'GraphQLError',
  'ApolloError',
  'RpcException',
  'WsException',
]);

export function isProjectDeclaration(node: TypeScript.Node): boolean {
  const file = node.getSourceFile();
  return !(
    file.isDeclarationFile || file.fileName.replaceAll('\\', '/').includes('/node_modules/')
  );
}

function decoratorName(decorator: TypeScript.Decorator): string | undefined {
  const expression = ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression;
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  return ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
}

export function decoratorArguments(decorator: TypeScript.Decorator): TypeScript.Expression[] {
  return ts.isCallExpression(decorator.expression) ? [...decorator.expression.arguments] : [];
}

export function decoratedWith(
  node: TypeScript.Node,
  names: ReadonlySet<string>,
): readonly TypeScript.Decorator[] {
  return decoratorsOf(node).filter((decorator) => {
    const name = decoratorName(decorator);
    return name !== undefined && names.has(name);
  });
}

function valueSymbol(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): TypeScript.Symbol | undefined {
  const { parent } = node;
  return ts.isShorthandPropertyAssignment(parent) && parent.name === node
    ? checker.getShorthandAssignmentValueSymbol(parent)
    : aliasedSymbolAt(checker, node);
}

function isInitializedVariable(node: TypeScript.Node): node is TypeScript.VariableDeclaration {
  return ts.isVariableDeclaration(node) && node.initializer !== undefined;
}

function declaredClass(checker: TypeScript.TypeChecker, expression: TypeScript.Node): ClassSearch {
  const target = ts.isNewExpression(expression) ? expression.expression : expression;
  const declarations = valueSymbol(checker, target)?.declarations ?? [];
  const found = declarations.find((declaration): declaration is TypeScript.ClassLikeDeclaration =>
    ts.isClassLike(declaration),
  );
  if (found !== undefined) {
    return { found };
  }
  const variable = declarations.find(isInitializedVariable);
  return { next: variable?.initializer };
}

export function classDeclarationOf(
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Node | undefined,
): TypeScript.ClassLikeDeclaration | undefined {
  return ALIAS_ROUNDS.reduce<ClassSearch>(
    (state) =>
      state.found !== undefined || state.next === undefined
        ? state
        : declaredClass(checker, state.next),
    { next: expression },
  ).found;
}

export function hasOpaqueBase(chain: Chain): boolean {
  const base = (chain.at(-1)?.heritageClauses ?? [])
    .find((heritage) => heritage.token === ts.SyntaxKind.ExtendsKeyword)
    ?.types.at(0)?.expression;
  return base !== undefined && !ts.isIdentifier(base) && !ts.isPropertyAccessExpression(base);
}

function parentOf(
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.ClassLikeDeclaration,
): TypeScript.ClassLikeDeclaration | undefined {
  const clause = (declaration.heritageClauses ?? []).find(
    (heritage) => heritage.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const [base] = clause?.types ?? [];
  return base === undefined ? undefined : classDeclarationOf(checker, base.expression);
}

export function ancestorsOf(
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.ClassLikeDeclaration,
): TypeScript.ClassLikeDeclaration[] {
  const chain = [declaration];
  const members = new Set(chain);
  for (const current of chain) {
    const parent = chain.length > MAX_ANCESTORS ? undefined : parentOf(checker, current);
    if (parent !== undefined && !members.has(parent)) {
      members.add(parent);
      chain.push(parent);
    }
  }
  return chain;
}

export function classLabel(declaration: TypeScript.ClassLikeDeclaration): string {
  return declaration.name?.text ?? 'anonymous class';
}

export function hasFrameworkStatus(chain: Chain): boolean {
  return chain.some(
    (declaration) =>
      !isProjectDeclaration(declaration) && FRAMEWORK_STATUS_CLASSES.has(classLabel(declaration)),
  );
}
