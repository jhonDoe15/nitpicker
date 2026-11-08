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

export function importOf(identifier) {
  const file = identifier.getSourceFile();
  return file.statements
    .map((statement) => statementBinding(statement, identifier.text))
    .find((found) => found !== undefined);
}

export function isFromPackage(identifier, packages) {
  const source = identifier === undefined ? undefined : importOf(identifier)?.source;
  return (
    source !== undefined &&
    packages.some((name) => source === name || source.startsWith(`${name}/`))
  );
}

function localDeclaration(identifier) {
  for (const statement of identifier.getSourceFile().statements) {
    const declaration = ts.isExportDeclaration(statement) ? undefined : statement;
    if (
      declaration !== undefined &&
      ts.isClassDeclaration(declaration) &&
      declaration.name?.text === identifier.text
    ) {
      return declaration;
    }
    const variable =
      declaration !== undefined && ts.isVariableStatement(declaration)
        ? declaration.declarationList.declarations.find(
            (entry) => nameOf(entry.name) === identifier.text,
          )
        : undefined;
    if (variable !== undefined) {
      return variable;
    }
  }
  return undefined;
}

function checkedDeclaration(checker, identifier) {
  const symbol = checker.getSymbolAtLocation(identifier);
  const target =
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return (target?.declarations ?? []).find(
    (declaration) => ts.isClassDeclaration(declaration) || ts.isVariableDeclaration(declaration),
  );
}

export function declarationOf(identifier, checker) {
  if (identifier.getSourceFile() === undefined) {
    return undefined;
  }
  const local = localDeclaration(identifier);
  if (local !== undefined || checker === undefined) {
    return local;
  }
  return checkedDeclaration(checker, identifier);
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

export function decoratorCall(decorator) {
  const { expression } = decorator;
  const callee = ts.isCallExpression(expression) ? expression.expression : expression;
  const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : nameOf(callee);
  return {
    name,
    base: baseIdentifier(callee),
    arguments: ts.isCallExpression(expression) ? [...expression.arguments] : [],
  };
}
