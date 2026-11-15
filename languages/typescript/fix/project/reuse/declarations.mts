import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type { ReplaceEdit } from '../typed/project-types.mts';
import { replaceEdit } from '../typed/project-views.mts';

const ts = typescriptApi();

type DeclarationKind = 'const' | 'function' | 'type';

export type Declaration = {
  readonly statement: TypeScript.Statement;
  readonly kind: DeclarationKind;
  readonly exported: boolean;
};

function isExported(statement: TypeScript.Statement): boolean {
  return ((ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined) ?? []).some(
    ({ kind }) => kind === ts.SyntaxKind.ExportKeyword,
  );
}

function declaredName(
  statement: TypeScript.Statement,
): { readonly name: string; readonly kind: DeclarationKind } | undefined {
  if (ts.isVariableStatement(statement)) {
    const [only, ...rest] = statement.declarationList.declarations;
    return only !== undefined && rest.length === 0 && ts.isIdentifier(only.name)
      ? { name: only.name.text, kind: 'const' }
      : undefined;
  }
  const named = ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement);
  if (named && statement.name !== undefined) {
    return { name: statement.name.text, kind: 'function' };
  }
  const isType = ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement);
  return isType ? { name: statement.name.text, kind: 'type' } : undefined;
}

export function declarationOf(
  sourceFile: TypeScript.SourceFile | undefined,
  name: string,
): Declaration | undefined {
  for (const statement of sourceFile?.statements ?? []) {
    const declared = declaredName(statement);
    if (declared?.name === name) {
      return { statement, kind: declared.kind, exported: isExported(statement) };
    }
  }
  return undefined;
}

export function removalEdit(
  path: string,
  statement: TypeScript.Node,
  replacement = '',
): ReplaceEdit {
  const sourceFile = statement.getSourceFile();
  const { text } = sourceFile;
  const start = statement.getStart(sourceFile, true);
  const end =
    replacement === '' && text[statement.end] === '\n' ? statement.end + 1 : statement.end;
  return replaceEdit(path, [start, end], replacement);
}

export function importInsertion(
  path: string,
  sourceFile: TypeScript.SourceFile,
  line: string,
): ReplaceEdit {
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const last = imports.at(-1);
  if (last === undefined) {
    return replaceEdit(path, [0, 0], `${line}\n`);
  }
  return replaceEdit(path, [last.end, last.end], `\n${line}`);
}

export function exportKeywordEdit(
  path: string,
  sourceFile: TypeScript.SourceFile,
  statement: TypeScript.Node,
): ReplaceEdit {
  const at = statement.getStart(sourceFile);
  return replaceEdit(path, [at, at], 'export ');
}
