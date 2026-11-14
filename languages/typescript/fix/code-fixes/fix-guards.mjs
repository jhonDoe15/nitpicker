import { lazyTypeScriptApi } from '../../typescript-api/lazy-typescript-api.mjs';

function assignments(ts) {
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

function effectKinds(ts) {
  return [
    ts.SyntaxKind.CallExpression,
    ts.SyntaxKind.NewExpression,
    ts.SyntaxKind.AwaitExpression,
    ts.SyntaxKind.YieldExpression,
    ts.SyntaxKind.TaggedTemplateExpression,
    ts.SyntaxKind.DeleteExpression,
  ];
}

function hasEffect(ts, node) {
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

function removesEffect(ts, sourceFile, { start, end }) {
  let found = false;
  function visit(node) {
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

function exportedByName(ts, sourceFile, name) {
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

function isExportedStatement(ts, node) {
  const flags = ts.getCombinedModifierFlags(node);
  return (flags & (ts.ModifierFlags.Export | ts.ModifierFlags.Default)) !== 0;
}

function isPublicFunction(ts, sourceFile, fn) {
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

function nodeAt(ts, sourceFile, position) {
  let best = sourceFile;
  function visit(node) {
    if (node.getStart(sourceFile) <= position && position < node.end) {
      best = node;
      ts.forEachChild(node, visit);
    }
  }
  visit(sourceFile);
  return best;
}

function removesPublicParameter(ts, sourceFile, position) {
  const parameter = ts.findAncestor(nodeAt(ts, sourceFile, position), ts.isParameter);
  return parameter !== undefined && isPublicFunction(ts, sourceFile, parameter.parent);
}

export function unusedDeclarationDeclined(sourceFile, { position, edits }) {
  const ts = lazyTypeScriptApi();
  return (
    removesPublicParameter(ts, sourceFile, position) ||
    edits.some((edit) => edit.text === '' && removesEffect(ts, sourceFile, edit))
  );
}
