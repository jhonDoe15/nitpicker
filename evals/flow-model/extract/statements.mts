import ts from 'typescript';
import type {
  BindStmt,
  Expr,
  ExtractContext,
  FunctionNode,
  LocalExpr,
  Stmt,
  Unsupported,
} from '../model/syntax-types.mts';
import { effectsOf } from '../mutation/mutation.mts';
import { toExpr, unwrap } from './expressions.mts';
import { bindingFieldName, isAssignmentOperator, locationOf } from './program.mts';

const LOOPS = [
  ts.isForStatement,
  ts.isForOfStatement,
  ts.isForInStatement,
  ts.isWhileStatement,
  ts.isDoStatement,
];

function unsupportedStatement(node: ts.Node, cx: ExtractContext, syntax: string): Unsupported {
  return {
    kind: 'unsupported',
    syntax,
    ...effectsOf(node, cx),
    loc: locationOf(cx.sourceFile, node),
  };
}

function localOf(element: ts.Node, cx: ExtractContext): LocalExpr {
  const local = cx.locals.get(element);
  if (local === undefined) {
    throw new Error('flow-model: a destructured binding was not registered as a local');
  }
  return local;
}

function elementStatement(element: ts.BindingElement, source: Expr, cx: ExtractContext): BindStmt {
  const local = localOf(element, cx);
  const value: Expr = { kind: 'get', object: source, field: bindingFieldName(element) };
  return {
    kind: 'bind',
    id: local.id,
    name: local.name,
    value,
    loc: locationOf(cx.sourceFile, element),
  };
}

function patternClobbers(pattern: ts.BindingPattern, cx: ExtractContext): string[] {
  const elements: readonly ts.Node[] = pattern.elements;
  return elements
    .filter((element) => cx.locals.has(element))
    .map((element) => `local:${localOf(element, cx).id}`);
}

function unsupportedPattern(
  node: ts.Node,
  pattern: ts.BindingPattern,
  cx: ExtractContext,
): Unsupported {
  const statement = unsupportedStatement(node, cx, 'binding-pattern');
  const clobbers = [...new Set([...statement.clobbers, ...patternClobbers(pattern, cx)])].sort();
  return { ...statement, mutates: true, clobbers };
}

function declarationStatements(declaration: ts.VariableDeclaration, cx: ExtractContext): Stmt[] {
  const loc = locationOf(cx.sourceFile, declaration);
  const value: Expr =
    declaration.initializer === undefined
      ? { kind: 'undefined' }
      : toExpr(declaration.initializer, cx);
  const local = cx.locals.get(declaration);
  if (local === undefined) {
    return [unsupportedStatement(declaration, cx, 'binding-pattern')];
  }
  const bind: BindStmt = { kind: 'bind', id: local.id, name: local.name, value, loc };
  const { name } = declaration;
  if (ts.isIdentifier(name)) {
    return [bind];
  }
  if (!ts.isObjectBindingPattern(name)) {
    throw new Error('flow-model: array binding patterns are not registered as locals');
  }
  if (!name.elements.every((element) => cx.locals.has(element))) {
    return [unsupportedPattern(declaration, name, cx)];
  }
  const source: Expr = { kind: 'local', id: local.id, name: local.name };
  return [bind, ...name.elements.map((element) => elementStatement(element, source, cx))];
}

function variableStatements(node: ts.VariableStatement, cx: ExtractContext): Stmt[] {
  return node.declarationList.declarations.flatMap((declaration) =>
    declarationStatements(declaration, cx),
  );
}

function assignmentStatement(
  node: ts.ExpressionStatement,
  expression: ts.BinaryExpression,
  cx: ExtractContext,
): Stmt {
  const target = unwrap(expression.left);
  if (!ts.isPropertyAccessExpression(target) || ts.isOptionalChain(target)) {
    return unsupportedStatement(node, cx, 'reassignment');
  }
  const object = toExpr(target.expression, cx);
  const value = toExpr(expression.right, cx);
  return {
    kind: 'set',
    object,
    field: target.name.text,
    value,
    loc: locationOf(cx.sourceFile, node),
  };
}

function expressionStatement(node: ts.ExpressionStatement, cx: ExtractContext): Stmt[] {
  const expression = unwrap(node.expression);
  if (ts.isBinaryExpression(expression) && isAssignmentOperator(expression.operatorToken.kind)) {
    if (expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      return [assignmentStatement(node, expression, cx)];
    }
    return [unsupportedStatement(node, cx, 'compound-assignment')];
  }
  return [{ kind: 'eval', value: toExpr(expression, cx), loc: locationOf(cx.sourceFile, node) }];
}

function ifStatement(node: ts.IfStatement, cx: ExtractContext): Stmt[] {
  const test = toExpr(node.expression, cx);
  const then = blockOf(node.thenStatement, cx);
  const otherwise = node.elseStatement === undefined ? [] : blockOf(node.elseStatement, cx);
  const testLoc = locationOf(cx.sourceFile, node.expression);
  return [
    { kind: 'if', test, testLoc, then, else: otherwise, loc: locationOf(cx.sourceFile, node) },
  ];
}

function completionStatement(
  node: ts.ReturnStatement | ts.ThrowStatement,
  cx: ExtractContext,
): Stmt[] {
  const kind = ts.isReturnStatement(node) ? 'return' : 'throw';
  const value: Expr =
    node.expression === undefined ? { kind: 'undefined' } : toExpr(node.expression, cx);
  return [{ kind, value, loc: locationOf(cx.sourceFile, node) }];
}

function catchField(
  element: ts.BindingElement,
  cx: ExtractContext,
): readonly [string, string | undefined] {
  return [localOf(element, cx).id, bindingFieldName(element)];
}

function tryStatement(node: ts.TryStatement, cx: ExtractContext): Stmt[] {
  const { catchClause } = node;
  if (node.finallyBlock !== undefined || catchClause === undefined) {
    return [unsupportedStatement(node, cx, 'finally')];
  }
  const declaration = catchClause.variableDeclaration;
  const local = declaration === undefined ? undefined : cx.locals.get(declaration);
  const pattern =
    declaration !== undefined && !ts.isIdentifier(declaration.name) ? declaration.name : undefined;
  const elements: readonly ts.Node[] = pattern === undefined ? [] : pattern.elements;
  if (pattern !== undefined && !elements.every((element) => cx.locals.has(element))) {
    return [unsupportedPattern(node, pattern, cx)];
  }
  const handler = blockOf(catchClause.block, cx);
  const body = blockOf(node.tryBlock, cx);
  const fields = elements.filter(ts.isBindingElement).map((element) => catchField(element, cx));
  return [
    {
      kind: 'try',
      body,
      ...(local === undefined ? {} : { catchId: local.id }),
      ...(fields.length === 0 ? {} : { catchFields: fields }),
      handler,
      loc: locationOf(cx.sourceFile, node),
    },
  ];
}

function statementOf(node: ts.Node, cx: ExtractContext): Stmt[] {
  if (LOOPS.some((test) => test(node))) {
    return [unsupportedStatement(node, cx, 'loop')];
  }
  if (ts.isVariableStatement(node)) {
    return variableStatements(node, cx);
  }
  if (ts.isExpressionStatement(node)) {
    return expressionStatement(node, cx);
  }
  if (ts.isIfStatement(node)) {
    return ifStatement(node, cx);
  }
  if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) {
    return completionStatement(node, cx);
  }
  if (ts.isTryStatement(node)) {
    return tryStatement(node, cx);
  }
  if (ts.isBlock(node)) {
    return statementsOf(node.statements, cx);
  }
  if (ts.isEmptyStatement(node)) {
    return [];
  }
  return [unsupportedStatement(node, cx, ts.SyntaxKind[node.kind] ?? '')];
}

function statementsOf(nodes: readonly ts.Node[], cx: ExtractContext): Stmt[] {
  return nodes.flatMap((node) => statementOf(node, cx));
}

function blockOf(node: ts.Statement, cx: ExtractContext): Stmt[] {
  return ts.isBlock(node) ? statementsOf(node.statements, cx) : statementOf(node, cx);
}

export function bodyOf(fn: FunctionNode, cx: ExtractContext): Stmt[] {
  if (ts.isBlock(fn.body)) {
    return statementsOf(fn.body.statements, cx);
  }
  return [{ kind: 'return', value: toExpr(fn.body, cx), loc: locationOf(cx.sourceFile, fn.body) }];
}
