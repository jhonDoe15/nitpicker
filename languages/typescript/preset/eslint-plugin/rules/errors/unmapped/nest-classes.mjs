import { ts } from '../../../../../typescript-api/typescript-api.mjs';

const MAX_ANCESTORS = 12;
const ALIAS_ROUNDS = Array.from({ length: 3 });
const FRAMEWORK_STATUS_CLASSES = new Set([
  'HttpException',
  'GraphQLError',
  'ApolloError',
  'RpcException',
  'WsException',
]);

export function isProjectDeclaration(node) {
  const file = node.getSourceFile();
  return !file.isDeclarationFile && !file.fileName.replaceAll('\\', '/').includes('/node_modules/');
}

function decoratorsOf(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorName(decorator) {
  const expression = ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression;
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  return ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
}

export function decoratorArguments(decorator) {
  return ts.isCallExpression(decorator.expression) ? [...decorator.expression.arguments] : [];
}

export function decoratedWith(node, names) {
  return decoratorsOf(node).filter((decorator) => names.has(decoratorName(decorator)));
}

function targetSymbol(checker, node) {
  const symbol = checker.getSymbolAtLocation(node);
  return symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function valueSymbol(checker, node) {
  const { parent } = node;
  return parent !== undefined && ts.isShorthandPropertyAssignment(parent) && parent.name === node
    ? checker.getShorthandAssignmentValueSymbol(parent)
    : targetSymbol(checker, node);
}

function declaredClass(checker, expression) {
  const target = ts.isNewExpression(expression) ? expression.expression : expression;
  const declarations = valueSymbol(checker, target)?.declarations ?? [];
  const found = declarations.find((declaration) => ts.isClassLike(declaration));
  if (found !== undefined) {
    return { found };
  }
  const variable = declarations.find(
    (declaration) => ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined,
  );
  return { next: variable?.initializer };
}

export function classDeclarationOf(checker, expression) {
  return ALIAS_ROUNDS.reduce(
    (state) =>
      state.found !== undefined || state.next === undefined
        ? state
        : declaredClass(checker, state.next),
    { next: expression },
  ).found;
}

export function hasOpaqueBase(chain) {
  const base = (chain.at(-1)?.heritageClauses ?? [])
    .find((heritage) => heritage.token === ts.SyntaxKind.ExtendsKeyword)
    ?.types.at(0)?.expression;
  return base !== undefined && !ts.isIdentifier(base) && !ts.isPropertyAccessExpression(base);
}

function parentOf(checker, declaration) {
  const clause = (declaration.heritageClauses ?? []).find(
    (heritage) => heritage.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const [base] = clause?.types ?? [];
  return base === undefined ? undefined : classDeclarationOf(checker, base.expression);
}

export function ancestorsOf(checker, declaration) {
  const chain = [declaration];
  for (const current of chain) {
    const parent = chain.length > MAX_ANCESTORS ? undefined : parentOf(checker, current);
    if (parent !== undefined && !chain.includes(parent)) {
      chain.push(parent);
    }
  }
  return chain;
}

export function classLabel(declaration) {
  return declaration.name?.text ?? 'anonymous class';
}

export function hasFrameworkStatus(chain) {
  return chain.some(
    (declaration) =>
      !isProjectDeclaration(declaration) && FRAMEWORK_STATUS_CLASSES.has(classLabel(declaration)),
  );
}
