import { ts } from '../../../typescript-api/typescript-api.mjs';
import { replaceEdit } from '../edits/text-edits.mjs';

function isExported(statement) {
  return (ts.getModifiers(statement) ?? []).some(
    ({ kind }) => kind === ts.SyntaxKind.ExportKeyword,
  );
}

function declaredName(statement) {
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

export function declarationOf(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    const declared = declaredName(statement);
    if (declared?.name === name) {
      return { statement, kind: declared.kind, exported: isExported(statement) };
    }
  }
  return undefined;
}

export function removalEdit(path, statement, replacement = '') {
  const sourceFile = statement.getSourceFile();
  const { text } = sourceFile;
  const start = statement.getStart(sourceFile, true);
  const end =
    replacement === '' && text[statement.end] === '\n' ? statement.end + 1 : statement.end;
  return replaceEdit(path, [start, end], replacement);
}

export function importInsertion(path, sourceFile, line) {
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const last = imports.at(-1);
  if (last === undefined) {
    return replaceEdit(path, [0, 0], `${line}\n`);
  }
  return replaceEdit(path, [last.end, last.end], `\n${line}`);
}

export function exportKeywordEdit(path, sourceFile, statement) {
  const at = statement.getStart(sourceFile);
  return replaceEdit(path, [at, at], 'export ');
}
