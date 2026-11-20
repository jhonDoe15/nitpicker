import type TypeScript from 'typescript';
import { ts } from './typed/typescript-compiler.mts';
import { syntaxChildren } from './children.mts';
import { isComponentName } from './component-names.mts';
import { appendAll } from '../../../../shared/lists/lists.mts';

type Declared = { name: string; node: TypeScript.Node | undefined; at: TypeScript.Node };
type ExportedComponent = { name: string; line: number };

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

function isTransparent(
  node: TypeScript.Node,
): node is
  | TypeScript.ParenthesizedExpression
  | TypeScript.AsExpression
  | TypeScript.SatisfiesExpression
  | TypeScript.NonNullExpression
  | TypeScript.TypeAssertion {
  return (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node)
  );
}

function valueChildren(node: TypeScript.Node): TypeScript.Node[] {
  if (ts.isConditionalExpression(node)) {
    return [node.whenTrue, node.whenFalse];
  }
  if (ts.isBinaryExpression(node) && LOGICAL_OPERATORS.has(node.operatorToken.kind)) {
    return [node.left, node.right];
  }
  return isTransparent(node) ? [node.expression] : [];
}

function isJsxValue(expression: TypeScript.Node | undefined): boolean {
  const pending = [expression];
  for (const node of pending) {
    if (node !== undefined && JSX_KINDS.has(node.kind)) {
      return true;
    }
    if (node !== undefined) {
      appendAll(pending, valueChildren(node));
    }
  }
  return false;
}

function returnsJsx(fn: TypeScript.SignatureDeclaration): boolean {
  const body = 'body' in fn ? fn.body : undefined;
  if (body === undefined || !ts.isBlock(body)) {
    return isJsxValue(body);
  }
  const pending: TypeScript.Node[] = [...body.statements];
  for (const node of pending) {
    if (ts.isReturnStatement(node) && isJsxValue(node.expression)) {
      return true;
    }
    if (!(ts.isFunctionLike(node) || ts.isReturnStatement(node))) {
      appendAll(pending, syntaxChildren(node));
    }
  }
  return false;
}

function extendsComponent(declaration: TypeScript.ClassLikeDeclaration): boolean {
  const base = declaration.heritageClauses
    ?.find(({ token }) => token === ts.SyntaxKind.ExtendsKeyword)
    ?.types.at(0)?.expression;
  if (base === undefined) {
    return false;
  }
  const name = ts.isPropertyAccessExpression(base) ? base.name.text : base.getText();
  return COMPONENT_BASES.has(name);
}

function isWrapperCall(call: TypeScript.CallExpression): boolean {
  const { expression } = call;
  const name = ts.isPropertyAccessExpression(expression)
    ? expression.name.text
    : expression.getText();
  return COMPONENT_WRAPPERS.has(name);
}

function isComponentValue(node: TypeScript.Node | undefined): boolean {
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

function scriptKindOf(fileName: string): TypeScript.ScriptKind {
  if (fileName.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  return /\.[cm]?ts$/u.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.JSX;
}

function isDeclarationNode(node: TypeScript.Node): node is TypeScript.Declaration {
  return (
    ts.isVariableStatement(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
  );
}

function isExported(node: TypeScript.Node): boolean {
  return (
    isDeclarationNode(node) && (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0
  );
}

function declarationsOf(statement: TypeScript.Statement): Declared[] {
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

function assignedIdentifier(statement: TypeScript.ExportAssignment): string | undefined {
  const { expression } = statement;
  const target = ts.isCallExpression(expression) ? expression.arguments[0] : expression;
  return target !== undefined && ts.isIdentifier(target) ? target.text : undefined;
}

function exportedNamesOf(statement: TypeScript.Statement): string[] {
  if (ts.isExportAssignment(statement)) {
    return [assignedIdentifier(statement)].filter((name) => name !== undefined);
  }
  if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined) {
    const clause = statement.exportClause;
    const isLocal = statement.moduleSpecifier === undefined && ts.isNamedExports(clause);
    return isLocal
      ? clause.elements.map((element) => (element.propertyName ?? element.name).text)
      : [];
  }
  return isExported(statement) ? declarationsOf(statement).map(({ name }) => name) : [];
}

function isAnonymousDefaultComponent(statement: TypeScript.Statement): boolean {
  return (
    ts.isExportAssignment(statement) &&
    assignedIdentifier(statement) === undefined &&
    isComponentValue(statement.expression)
  );
}

function lineOf(source: TypeScript.SourceFile, node: TypeScript.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

export function exportedComponents(text: string, fileName: string): ExportedComponent[] {
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
    .map((name) => ({ name, line: lineOf(source, declared.get(name)?.at ?? source) }));
  const anonymous = statements.find(isAnonymousDefaultComponent);
  return anonymous === undefined
    ? named
    : [...named, { name: DEFAULT_EXPORT, line: lineOf(source, anonymous) }];
}
