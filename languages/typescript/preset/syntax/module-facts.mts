import type TypeScript from 'typescript';
import { ts } from './typed/typescript-compiler.mts';
import { fileNodes } from './references.mts';
import { byText } from '../../../../shared/text-order/by-text.mts';
import { appendAll } from '../../../../shared/lists/lists.mts';

const DEFAULT_NAME = 'default';

type NamedImport = { imported: string; local: string; typeOnly: boolean };
type NamedExport = { imported: string; exported: string };
type ImportFact = {
  specifier: string;
  defaultName: string | undefined;
  namespaceName: string | undefined;
  typeOnly: boolean;
  named: NamedImport[];
};
type AliasDeclaration = TypeScript.VariableDeclaration & {
  name: TypeScript.Identifier;
  initializer: TypeScript.Identifier;
};
type SpecifiedExport = TypeScript.ExportDeclaration & { moduleSpecifier: TypeScript.StringLiteral };
type NamespaceReexport = SpecifiedExport & { exportClause: TypeScript.NamespaceExport };
type ExportFacts = {
  aliases: { local: string; exported: string }[];
  locals: { local: string; exported: string }[];
  namespaces: { specifier: string; name: string }[];
  reexports: { specifier: string; star: boolean; names: NamedExport[] }[];
};
type ExportSite = { name: string; node: TypeScript.Node };

function clauseTypeOnly(clause: TypeScript.ImportClause): boolean {
  const typeOnly: unknown = Reflect.get(clause, 'isTypeOnly');
  return typeOnly === true;
}

function importedNames(clause: TypeScript.ImportClause): NamedImport[] {
  const bindings = clause.namedBindings;
  return bindings !== undefined && ts.isNamedImports(bindings)
    ? bindings.elements.map((element) => ({
        imported: (element.propertyName ?? element.name).text,
        local: element.name.text,
        typeOnly: clauseTypeOnly(clause) || element.isTypeOnly,
      }))
    : [];
}

function namespaceNameOf(clause: TypeScript.ImportClause): string | undefined {
  const bindings = clause.namedBindings;
  return bindings !== undefined && ts.isNamespaceImport(bindings) ? bindings.name.text : undefined;
}

export function fileImports(sourceFile: TypeScript.SourceFile): ImportFact[] {
  return sourceFile.statements.filter(ts.isImportDeclaration).flatMap((statement) => {
    const clause = statement.importClause;
    return clause !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
      ? [
          {
            specifier: statement.moduleSpecifier.text,
            defaultName: clause.name?.text,
            namespaceName: namespaceNameOf(clause),
            typeOnly: clauseTypeOnly(clause),
            named: importedNames(clause),
          },
        ]
      : [];
  });
}

function isLoadCall(node: TypeScript.CallExpression): boolean {
  const callee = node.expression;
  return (
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) && callee.text === 'require')
  );
}

export function fileDynamicImports(sourceFile: TypeScript.SourceFile): string[] {
  return fileNodes(sourceFile)
    .filter(ts.isCallExpression)
    .filter((node) => isLoadCall(node) && node.arguments[0] !== undefined)
    .map((node) => node.arguments[0])
    .filter((node) => node !== undefined && ts.isStringLiteralLike(node))
    .map(({ text }) => text)
    .toSorted(byText);
}

function exportedNames(clause: TypeScript.NamedExportBindings | undefined): NamedExport[] {
  return clause !== undefined && ts.isNamedExports(clause)
    ? clause.elements.map((element) => ({
        imported: (element.propertyName ?? element.name).text,
        exported: element.name.text,
      }))
    : [];
}

function defaultExportedName(
  sourceFile: TypeScript.SourceFile,
): { local: string; exported: string }[] {
  return sourceFile.statements
    .filter(ts.isExportAssignment)
    .map(({ expression }) => expression)
    .filter(ts.isIdentifier)
    .map(({ text }) => ({ local: text, exported: DEFAULT_NAME }));
}

function modifierKinds(statement: TypeScript.Node): TypeScript.SyntaxKind[] {
  return ts.canHaveModifiers(statement)
    ? (ts.getModifiers(statement) ?? []).map(({ kind }) => kind)
    : [];
}

function exportedAliasDeclarations(sourceFile: TypeScript.SourceFile): AliasDeclaration[] {
  return sourceFile.statements
    .filter(ts.isVariableStatement)
    .filter((statement) => modifierKinds(statement).includes(ts.SyntaxKind.ExportKeyword))
    .flatMap((statement) => statement.declarationList.declarations)
    .filter(
      (declaration): declaration is AliasDeclaration =>
        ts.isIdentifier(declaration.name) &&
        declaration.initializer !== undefined &&
        ts.isIdentifier(declaration.initializer),
    );
}

export function fileAliasReads(sourceFile: TypeScript.SourceFile): TypeScript.Identifier[] {
  return exportedAliasDeclarations(sourceFile).map(({ initializer }) => initializer);
}

export function fileExports(sourceFile: TypeScript.SourceFile): ExportFacts {
  const declarations = sourceFile.statements
    .filter(ts.isExportDeclaration)
    .filter(({ exportClause }) => exportClause === undefined || ts.isNamedExports(exportClause));
  const withSpecifier = declarations.filter(
    (declaration): declaration is SpecifiedExport =>
      declaration.moduleSpecifier !== undefined && ts.isStringLiteral(declaration.moduleSpecifier),
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
        (declaration): declaration is NamespaceReexport =>
          declaration.exportClause !== undefined &&
          ts.isNamespaceExport(declaration.exportClause) &&
          declaration.moduleSpecifier !== undefined &&
          ts.isStringLiteral(declaration.moduleSpecifier),
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

function bindingIdentifiers(name: TypeScript.BindingName): TypeScript.Identifier[] {
  const pending: TypeScript.BindingName[] = [name];
  for (const node of pending) {
    if (!ts.isIdentifier(node)) {
      const elements: readonly TypeScript.ArrayBindingElement[] = node.elements;
      appendAll(
        pending,
        elements
          .filter(
            (element): element is TypeScript.BindingElement => !ts.isOmittedExpression(element),
          )
          .map(({ name: inner }) => inner),
      );
    }
  }
  return pending.filter(ts.isIdentifier);
}

function declarationName(
  statement: TypeScript.Statement,
): TypeScript.Identifier | TypeScript.StringLiteral | undefined {
  return ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isModuleDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement)
    ? statement.name
    : undefined;
}

function declaredExports(statement: TypeScript.Statement): ExportSite[] {
  const kinds = modifierKinds(statement);
  if (!kinds.includes(ts.SyntaxKind.ExportKeyword)) {
    return [];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .flatMap(({ name }) => bindingIdentifiers(name))
      .map((node) => ({ name: node.text, node }));
  }
  const declared = declarationName(statement);
  if (kinds.includes(ts.SyntaxKind.DefaultKeyword)) {
    return [{ name: DEFAULT_NAME, node: declared ?? statement }];
  }
  return declared === undefined ? [] : [{ name: declared.text, node: declared }];
}

function specifiedExports(statement: TypeScript.Statement): ExportSite[] {
  if (ts.isExportAssignment(statement)) {
    return [{ name: DEFAULT_NAME, node: statement }];
  }
  if (!ts.isExportDeclaration(statement)) {
    return [];
  }
  const clause = statement.exportClause;
  return statement.moduleSpecifier === undefined &&
    clause !== undefined &&
    ts.isNamedExports(clause)
    ? clause.elements.map((element) => ({ name: element.name.text, node: element }))
    : [];
}

export function exportLine(sourceFile: TypeScript.SourceFile, name: string): number | undefined {
  const found = sourceFile.statements
    .flatMap((statement) => [...declaredExports(statement), ...specifiedExports(statement)])
    .find((declaration) => declaration.name === name);
  return found === undefined
    ? undefined
    : sourceFile.getLineAndCharacterOfPosition(found.node.getStart(sourceFile)).line + 1;
}
