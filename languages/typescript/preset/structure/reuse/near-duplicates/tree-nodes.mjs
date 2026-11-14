import { ts } from '../../../../typescript-api/typescript-api.mjs';

export const NONE = Object.freeze({ kind: 'none', children: Object.freeze([]) });

function lineOf(sourceFile, position) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

export function at(shape, source, children = []) {
  const fields = typeof shape === 'string' ? { kind: shape } : shape;
  const sourceFile = source.getSourceFile();
  return {
    ...fields,
    children,
    start: lineOf(sourceFile, source.getStart(sourceFile)),
    end: lineOf(sourceFile, source.getEnd()),
  };
}

export function textOf(source, context) {
  return source.getText(context.sourceFile).replaceAll(/\s+/gu, ' ');
}

export function opaque(kind, source, context) {
  return at({ kind, value: `${ts.SyntaxKind[source.kind]}:${textOf(source, context)}` }, source);
}

export function optional(source, context) {
  return source === undefined ? NONE : context.get(source);
}

const STATEMENT_DECLARATIONS = [
  ts.isTypeAliasDeclaration,
  ts.isInterfaceDeclaration,
  ts.isEnumDeclaration,
  ts.isModuleDeclaration,
  ts.isImportDeclaration,
  ts.isImportEqualsDeclaration,
];

export function isStatementNode(source) {
  return (
    (source.kind >= ts.SyntaxKind.FirstStatement && source.kind <= ts.SyntaxKind.LastStatement) ||
    STATEMENT_DECLARATIONS.some((matches) => matches(source))
  );
}
