import ts from 'typescript';
import { fileNodes } from './references.mjs';

function importedNames(clause) {
  const bindings = clause.namedBindings;
  return bindings !== undefined && ts.isNamedImports(bindings)
    ? bindings.elements.map((element) => ({
        imported: (element.propertyName ?? element.name).text,
        local: element.name.text,
        typeOnly: clause.isTypeOnly || element.isTypeOnly,
      }))
    : [];
}

function namespaceNameOf(clause) {
  const bindings = clause.namedBindings;
  return bindings !== undefined && ts.isNamespaceImport(bindings) ? bindings.name.text : undefined;
}

export function fileImports(sourceFile) {
  return sourceFile.statements.filter(ts.isImportDeclaration).flatMap((statement) => {
    const clause = statement.importClause;
    return clause !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
      ? [
          {
            specifier: statement.moduleSpecifier.text,
            defaultName: clause.name?.text,
            namespaceName: namespaceNameOf(clause),
            typeOnly: clause.isTypeOnly,
            named: importedNames(clause),
          },
        ]
      : [];
  });
}

function isLoadCall(node) {
  const callee = node.expression;
  return (
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) && callee.text === 'require')
  );
}

export function fileDynamicImports(sourceFile) {
  return fileNodes(sourceFile)
    .filter(ts.isCallExpression)
    .filter((node) => isLoadCall(node) && node.arguments[0] !== undefined)
    .map((node) => node.arguments[0])
    .filter(ts.isStringLiteralLike)
    .map(({ text }) => text)
    .toSorted();
}

function exportedNames(clause) {
  return clause !== undefined && ts.isNamedExports(clause)
    ? clause.elements.map((element) => ({
        imported: (element.propertyName ?? element.name).text,
        exported: element.name.text,
      }))
    : [];
}

function defaultExportedName(sourceFile) {
  return sourceFile.statements
    .filter(ts.isExportAssignment)
    .map(({ expression }) => expression)
    .filter(ts.isIdentifier)
    .map(({ text }) => ({ local: text, exported: 'default' }));
}

function modifierKinds(statement) {
  return ts.canHaveModifiers(statement)
    ? (ts.getModifiers(statement) ?? []).map(({ kind }) => kind)
    : [];
}

function exportedAliasDeclarations(sourceFile) {
  return sourceFile.statements
    .filter(ts.isVariableStatement)
    .filter((statement) => modifierKinds(statement).includes(ts.SyntaxKind.ExportKeyword))
    .flatMap((statement) => statement.declarationList.declarations)
    .filter(
      ({ name, initializer }) =>
        ts.isIdentifier(name) && initializer !== undefined && ts.isIdentifier(initializer),
    );
}

export function fileAliasReads(sourceFile) {
  return exportedAliasDeclarations(sourceFile).map(({ initializer }) => initializer);
}

export function fileExports(sourceFile) {
  const declarations = sourceFile.statements
    .filter(ts.isExportDeclaration)
    .filter(({ exportClause }) => exportClause === undefined || ts.isNamedExports(exportClause));
  const withSpecifier = declarations.filter(
    ({ moduleSpecifier }) => moduleSpecifier !== undefined && ts.isStringLiteral(moduleSpecifier),
  );
  return {
    aliases: exportedAliasDeclarations(sourceFile).map(({ name, initializer }) => ({
      local: initializer.text,
      exported: name.text,
    })),
    locals: [
      ...declarations
        .filter(({ moduleSpecifier }) => moduleSpecifier === undefined)
        .flatMap(({ exportClause }) => exportedNames(exportClause))
        .map(({ imported, exported }) => ({ local: imported, exported })),
      ...defaultExportedName(sourceFile),
    ],
    namespaces: sourceFile.statements
      .filter(ts.isExportDeclaration)
      .filter(
        ({ exportClause, moduleSpecifier }) =>
          exportClause !== undefined &&
          ts.isNamespaceExport(exportClause) &&
          moduleSpecifier !== undefined &&
          ts.isStringLiteral(moduleSpecifier),
      )
      .map(({ exportClause, moduleSpecifier }) => ({
        specifier: moduleSpecifier.text,
        name: exportClause.name.text,
      })),
    reexports: withSpecifier.map((declaration) => ({
      specifier: declaration.moduleSpecifier.text,
      star: declaration.exportClause === undefined,
      names: exportedNames(declaration.exportClause),
    })),
  };
}

function bindingIdentifiers(name) {
  const pending = [name];
  for (const node of pending) {
    if (!ts.isIdentifier(node)) {
      pending.push(
        ...node.elements
          .filter((element) => !ts.isOmittedExpression(element))
          .map(({ name: inner }) => inner),
      );
    }
  }
  return pending.filter(ts.isIdentifier);
}

function declaredExports(statement) {
  const kinds = modifierKinds(statement);
  if (!kinds.includes(ts.SyntaxKind.ExportKeyword)) return [];
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .flatMap(({ name }) => bindingIdentifiers(name))
      .map((node) => ({ name: node.text, node }));
  }
  if (kinds.includes(ts.SyntaxKind.DefaultKeyword)) {
    return [{ name: 'default', node: statement.name ?? statement }];
  }
  return statement.name === undefined ? [] : [{ name: statement.name.text, node: statement.name }];
}

function specifiedExports(statement) {
  if (ts.isExportAssignment(statement)) return [{ name: 'default', node: statement }];
  const clause = ts.isExportDeclaration(statement) ? statement.exportClause : undefined;
  return statement.moduleSpecifier === undefined &&
    clause !== undefined &&
    ts.isNamedExports(clause)
    ? clause.elements.map((element) => ({ name: element.name.text, node: element }))
    : [];
}

export function exportLine(sourceFile, name) {
  const found = sourceFile.statements
    .flatMap((statement) => [...declaredExports(statement), ...specifiedExports(statement)])
    .find((declaration) => declaration.name === name);
  return found === undefined
    ? undefined
    : sourceFile.getLineAndCharacterOfPosition(found.node.getStart(sourceFile)).line + 1;
}
