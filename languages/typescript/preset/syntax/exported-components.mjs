import { ts } from '../../typescript-api/typescript-api.mjs';
import { syntaxChildren } from './children.mjs';
import { isComponentName } from './component-names.mjs';

export const DEFAULT_EXPORT = 'default';
const COMPONENT_BASES = new Set(['Component', 'PureComponent']);
const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef']);
const LOGICAL_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);
const JSX_KINDS = new Set([
  ts.SyntaxKind.JsxElement,
  ts.SyntaxKind.JsxSelfClosingElement,
  ts.SyntaxKind.JsxFragment,
]);

function isTransparent(node) {
  return (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node)
  );
}

function valueChildren(node) {
  if (ts.isConditionalExpression(node)) {
    return [node.whenTrue, node.whenFalse];
  }
  if (ts.isBinaryExpression(node) && LOGICAL_OPERATORS.has(node.operatorToken.kind)) {
    return [node.left, node.right];
  }
  return isTransparent(node) ? [node.expression] : [];
}

function isJsxValue(expression) {
  const pending = [expression];
  for (const node of pending) {
    if (node !== undefined && JSX_KINDS.has(node.kind)) {
      return true;
    }
    if (node !== undefined) {
      pending.push(...valueChildren(node));
    }
  }
  return false;
}

function returnsJsx(fn) {
  if (fn.body === undefined || !ts.isBlock(fn.body)) {
    return isJsxValue(fn.body);
  }
  const pending = [...fn.body.statements];
  for (const node of pending) {
    if (ts.isReturnStatement(node) && isJsxValue(node.expression)) {
      return true;
    }
    if (!ts.isFunctionLike(node) && !ts.isReturnStatement(node)) {
      pending.push(...syntaxChildren(node));
    }
  }
  return false;
}

function extendsComponent(declaration) {
  const base = declaration.heritageClauses
    ?.find(({ token }) => token === ts.SyntaxKind.ExtendsKeyword)
    ?.types.at(0)?.expression;
  if (base === undefined) {
    return false;
  }
  const name = ts.isPropertyAccessExpression(base) ? base.name.text : base.getText();
  return COMPONENT_BASES.has(name);
}

function isWrapperCall(call) {
  const { expression } = call;
  const name = ts.isPropertyAccessExpression(expression)
    ? expression.name.text
    : expression.getText();
  return COMPONENT_WRAPPERS.has(name);
}

function isComponentValue(node) {
  if (node === undefined) {
    return false;
  }
  if (ts.isFunctionLike(node)) {
    return returnsJsx(node);
  }
  if (ts.isClassLike(node)) {
    return extendsComponent(node);
  }
  return ts.isCallExpression(node) && isWrapperCall(node);
}

function scriptKindOf(fileName) {
  if (fileName.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  return /\.[cm]?ts$/u.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.JSX;
}

function isExported(node) {
  return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
}

function declarationsOf(statement) {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.map((declaration) => ({
      name: declaration.name.getText(),
      node: declaration.initializer,
      at: declaration,
    }));
  }
  const named = ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement);
  return named && statement.name !== undefined
    ? [{ name: statement.name.text, node: statement, at: statement }]
    : [];
}

function assignedIdentifier(statement) {
  const { expression } = statement;
  const target = ts.isCallExpression(expression) ? expression.arguments[0] : expression;
  return target !== undefined && ts.isIdentifier(target) ? target.text : undefined;
}

function exportedNamesOf(statement) {
  if (ts.isExportAssignment(statement)) {
    return [assignedIdentifier(statement)].filter((name) => name !== undefined);
  }
  const clause = ts.isExportDeclaration(statement) ? statement.exportClause : undefined;
  if (clause !== undefined) {
    const isLocal = statement.moduleSpecifier === undefined && ts.isNamedExports(clause);
    return isLocal
      ? clause.elements.map((element) => (element.propertyName ?? element.name).text)
      : [];
  }
  return isExported(statement) ? declarationsOf(statement).map(({ name }) => name) : [];
}

function isAnonymousDefaultComponent(statement) {
  return (
    ts.isExportAssignment(statement) &&
    assignedIdentifier(statement) === undefined &&
    isComponentValue(statement.expression)
  );
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

export function exportedComponents(text, fileName) {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(fileName),
  );
  const statements = [...source.statements];
  const declared = new Map(statements.flatMap(declarationsOf).map((entry) => [entry.name, entry]));
  const named = [...new Set(statements.flatMap(exportedNamesOf))]
    .filter((name) => isComponentName(name) && isComponentValue(declared.get(name)?.node))
    .sort()
    .map((name) => ({ name, line: lineOf(source, declared.get(name).at) }));
  const anonymous = statements.find(isAnonymousDefaultComponent);
  return anonymous === undefined
    ? named
    : [...named, { name: DEFAULT_EXPORT, line: lineOf(source, anonymous) }];
}
