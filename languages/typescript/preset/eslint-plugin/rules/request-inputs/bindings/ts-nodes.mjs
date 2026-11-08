import { ts } from '../../../../../typescript-api/typescript-api.mjs';

const MAX_ALIAS_DEPTH = 4;

const SCRIPT_KINDS = [
  [/\.tsx$/, ts.ScriptKind.TSX],
  [/\.[cm]?js$/, ts.ScriptKind.JS],
  [/\.jsx$/, ts.ScriptKind.JSX],
];

function scriptKind(filename) {
  return SCRIPT_KINDS.find(([pattern]) => pattern.test(filename))?.[1] ?? ts.ScriptKind.TS;
}

export function sourceOf(context) {
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

export function nameOf(node) {
  if (node === undefined) {
    return undefined;
  }
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
    return node.text;
  }
  return ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) ? node.text : undefined;
}

export function baseIdentifier(node) {
  const chain = [node];
  for (const current of chain) {
    if (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) {
      chain.push(current.expression);
    }
  }
  const base = chain.at(-1);
  return ts.isIdentifier(base) ? base : undefined;
}

function moduleText(specifier) {
  return specifier !== undefined && ts.isStringLiteral(specifier) ? specifier.text : undefined;
}

function importedName(clause, name) {
  if (clause.name?.text === name) {
    return { imported: 'default' };
  }
  const bindings = clause.namedBindings;
  if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
    return bindings.name.text === name ? { imported: '*' } : undefined;
  }
  const element = bindings?.elements.find((entry) => entry.name.text === name);
  return element === undefined
    ? undefined
    : { imported: (element.propertyName ?? element.name).text };
}

function requiredName(declaration, name) {
  const call = declaration.initializer;
  const isRequire =
    call !== undefined &&
    ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    call.expression.text === 'require';
  if (!isRequire) {
    return undefined;
  }
  const source = moduleText(call.arguments[0]);
  if (ts.isIdentifier(declaration.name)) {
    return declaration.name.text === name ? { source, imported: '*' } : undefined;
  }
  const element = ts.isObjectBindingPattern(declaration.name)
    ? declaration.name.elements.find((entry) => nameOf(entry.name) === name)
    : undefined;
  return element === undefined
    ? undefined
    : { source, imported: nameOf(element.propertyName ?? element.name) };
}

function statementBinding(statement, name) {
  if (ts.isImportDeclaration(statement) && statement.importClause !== undefined) {
    const found = importedName(statement.importClause, name);
    return found === undefined
      ? undefined
      : { source: moduleText(statement.moduleSpecifier), ...found };
  }
  if (!ts.isVariableStatement(statement)) {
    return undefined;
  }
  return statement.declarationList.declarations
    .map((declaration) => requiredName(declaration, name))
    .find((found) => found !== undefined);
}

function declaredNames(statement) {
  if (
    (ts.isClassDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
    statement.name !== undefined
  ) {
    return [[statement.name.text, statement]];
  }
  return ts.isVariableStatement(statement)
    ? statement.declarationList.declarations.map((entry) => [nameOf(entry.name), entry])
    : [];
}

function topLevelImport(file, name) {
  for (const statement of file.statements) {
    const binding = statementBinding(statement, name);
    if (binding !== undefined) {
      return binding;
    }
  }
  return undefined;
}

function topLevelDeclaration(file, name) {
  for (const statement of file.statements) {
    const found = declaredNames(statement).find(([declared]) => declared === name);
    if (found !== undefined) {
      return found[1];
    }
  }
  return undefined;
}

export function importOf(identifier) {
  return isShadowed(identifier)
    ? undefined
    : topLevelImport(identifier.getSourceFile(), identifier.text);
}

function declaresName(node, name) {
  const parameters = ts.isFunctionLike(node) ? node.parameters : [];
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

function isShadowed(identifier) {
  const ancestors = [identifier.parent];
  for (const node of ancestors) {
    if (node !== undefined && !ts.isSourceFile(node)) {
      ancestors.push(node.parent);
    }
  }
  return ancestors.some((node) => node !== undefined && declaresName(node, identifier.text));
}

export function isFromPackage(identifier, packages) {
  const source = identifier === undefined ? undefined : importOf(identifier)?.source;
  return (
    source !== undefined &&
    packages.some((name) => source === name || source.startsWith(`${name}/`))
  );
}

function localDeclaration(identifier) {
  return isShadowed(identifier)
    ? undefined
    : topLevelDeclaration(identifier.getSourceFile(), identifier.text);
}

function checkedDeclaration(checker, identifier) {
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

export function declarationOf(identifier, checker) {
  const checked = checker === undefined ? undefined : checkedDeclaration(checker, identifier);
  return checked ?? localDeclaration(identifier);
}

function isWrapper(node) {
  return (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  );
}

function aliasTarget(identifier, checker) {
  const declaration = declarationOf(identifier, checker);
  return declaration !== undefined && ts.isVariableDeclaration(declaration)
    ? declaration.initializer
    : undefined;
}

function nextExpression(node, checker, depth) {
  if (isWrapper(node)) {
    return node.expression;
  }
  return ts.isIdentifier(node) && depth <= MAX_ALIAS_DEPTH * 2
    ? aliasTarget(node, checker)
    : undefined;
}

export function resolvedExpression(node, checker) {
  const chain = node === undefined ? [] : [node];
  for (const current of chain) {
    const next = nextExpression(current, checker, chain.length);
    if (next !== undefined) {
      chain.push(next);
    }
  }
  const last = chain.at(-1);
  return last === undefined || ts.isIdentifier(last) ? undefined : last;
}

export function decoratorsOf(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function exportedName(identifier) {
  const imported = ts.isIdentifier(identifier) ? importOf(identifier)?.imported : undefined;
  return imported === undefined || imported === '*' || imported === 'default'
    ? nameOf(identifier)
    : imported;
}

export function decoratorCall(decorator) {
  const { expression } = decorator;
  const callee = ts.isCallExpression(expression) ? expression.expression : expression;
  const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : exportedName(callee);
  return {
    name,
    base: baseIdentifier(callee),
    arguments: ts.isCallExpression(expression) ? [...expression.arguments] : [],
  };
}
