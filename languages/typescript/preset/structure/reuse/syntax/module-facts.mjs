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

export function fileExports(sourceFile) {
  const declarations = sourceFile.statements
    .filter(ts.isExportDeclaration)
    .filter(({ exportClause }) => exportClause === undefined || ts.isNamedExports(exportClause));
  const withSpecifier = declarations.filter(
    ({ moduleSpecifier }) => moduleSpecifier !== undefined && ts.isStringLiteral(moduleSpecifier),
  );
  return {
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
        ({ exportClause }) => exportClause !== undefined && ts.isNamespaceExport(exportClause),
      )
      .map(({ moduleSpecifier }) => moduleSpecifier?.text)
      .filter((specifier) => specifier !== undefined),
    reexports: withSpecifier.map((declaration) => ({
      specifier: declaration.moduleSpecifier.text,
      star: declaration.exportClause === undefined,
      names: exportedNames(declaration.exportClause),
    })),
  };
}
