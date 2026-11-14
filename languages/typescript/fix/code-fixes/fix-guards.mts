import type TypeScript from 'typescript';
import { lazyTypeScriptApi } from '../typed/lazy-typescript-api.mts';

type Api = typeof TypeScript;

type SuggestionEdit = { readonly text: string; readonly start: number; readonly end: number };

function assignments(ts: Api): TypeScript.SyntaxKind[] {
  return [
    ts.SyntaxKind.EqualsToken,
    ts.SyntaxKind.PlusEqualsToken,
    ts.SyntaxKind.MinusEqualsToken,
    ts.SyntaxKind.AsteriskEqualsToken,
    ts.SyntaxKind.SlashEqualsToken,
    ts.SyntaxKind.QuestionQuestionEqualsToken,
    ts.SyntaxKind.BarBarEqualsToken,
    ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ];
}

function effectKinds(ts: Api): TypeScript.SyntaxKind[] {
  return [
    ts.SyntaxKind.CallExpression,
    ts.SyntaxKind.NewExpression,
    ts.SyntaxKind.AwaitExpression,
    ts.SyntaxKind.YieldExpression,
    ts.SyntaxKind.TaggedTemplateExpression,
    ts.SyntaxKind.DeleteExpression,
  ];
}

function hasEffect(ts: Api, node: TypeScript.Node): boolean {
  if (effectKinds(ts).includes(node.kind)) {
    return true;
  }
  if (ts.isBinaryExpression(node)) {
    return assignments(ts).includes(node.operatorToken.kind);
  }
  const isUpdate = ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node);
  return (
    isUpdate && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
  );
}

function removesEffect(
  ts: Api,
  sourceFile: TypeScript.SourceFile,
  { start, end }: { readonly start: number; readonly end: number },
): boolean {
  let found = false;
  function visit(node: TypeScript.Node): void {
    const overlaps = node.getStart(sourceFile) < end && node.end > start;
    if (!overlaps || found) {
      return;
    }
    const inside = node.getStart(sourceFile) >= start && node.end <= end;
    if (inside && ts.isFunctionLike(node)) {
      return;
    }
    found = inside && hasEffect(ts, node);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function exportedByName(ts: Api, sourceFile: TypeScript.SourceFile, name: string): boolean {
  return sourceFile.statements.some(
    (statement) =>
      (ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier === undefined &&
        statement.exportClause !== undefined &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.some(
          (element) => (element.propertyName ?? element.name).text === name,
        )) ||
      (ts.isExportAssignment(statement) &&
        ts.isIdentifier(statement.expression) &&
        statement.expression.text === name),
  );
}

function isExportedStatement(ts: Api, node: TypeScript.Declaration): boolean {
  const flags = ts.getCombinedModifierFlags(node);
  return (flags & (ts.ModifierFlags.Export | ts.ModifierFlags.Default)) !== 0;
}

function isPublicFunction(
  ts: Api,
  sourceFile: TypeScript.SourceFile,
  fn: TypeScript.Node,
): boolean {
  const { parent } = fn;
  if (ts.isMethodDeclaration(fn) || ts.isConstructorDeclaration(fn) || ts.isAccessor(fn)) {
    return (ts.getCombinedModifierFlags(fn) & ts.ModifierFlags.Private) === 0;
  }
  if (ts.isFunctionDeclaration(fn)) {
    return (
      isExportedStatement(ts, fn) ||
      (fn.name !== undefined && exportedByName(ts, sourceFile, fn.name.text))
    );
  }
  if (ts.isExportAssignment(parent)) {
    return true;
  }
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return isExportedStatement(ts, parent) || exportedByName(ts, sourceFile, parent.name.text);
  }
  return false;
}

function nodeAt(ts: Api, sourceFile: TypeScript.SourceFile, position: number): TypeScript.Node {
  let best: TypeScript.Node = sourceFile;
  function visit(node: TypeScript.Node): void {
    if (node.getStart(sourceFile) <= position && position < node.end) {
      best = node;
      ts.forEachChild(node, visit);
    }
  }
  visit(sourceFile);
  return best;
}

function removesPublicParameter(
  ts: Api,
  sourceFile: TypeScript.SourceFile,
  position: number,
): boolean {
  const parameter = ts.findAncestor(nodeAt(ts, sourceFile, position), ts.isParameter);
  return parameter !== undefined && isPublicFunction(ts, sourceFile, parameter.parent);
}

export function unusedDeclarationDeclined(
  sourceFile: TypeScript.SourceFile,
  { position, edits }: { readonly position: number; readonly edits: readonly SuggestionEdit[] },
): boolean {
  const ts = lazyTypeScriptApi();
  return (
    removesPublicParameter(ts, sourceFile, position) ||
    edits.some((edit) => edit.text === '' && removesEffect(ts, sourceFile, edit))
  );
}
