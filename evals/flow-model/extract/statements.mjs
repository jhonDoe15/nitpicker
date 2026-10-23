import ts from 'typescript';
import { effectsOf, toExpr, unwrap } from './expressions.mjs';
import { locationOf } from './program.mjs';

const LOOPS = [
  ts.isForStatement,
  ts.isForOfStatement,
  ts.isForInStatement,
  ts.isWhileStatement,
  ts.isDoStatement,
];

function unsupportedStatement(node, cx, syntax) {
  return {
    kind: 'unsupported',
    syntax,
    ...effectsOf(node, cx),
    loc: locationOf(cx.sourceFile, node),
  };
}

function elementStatement(element, source, cx) {
  const local = cx.locals.get(element);
  const field = (element.propertyName ?? element.name).text;
  const value = { kind: 'get', object: source, field };
  return {
    kind: 'bind',
    id: local.id,
    name: local.name,
    value,
    loc: locationOf(cx.sourceFile, element),
  };
}

function patternClobbers(pattern, cx) {
  return pattern.elements
    .filter((element) => cx.locals.has(element))
    .map((element) => `local:${cx.locals.get(element).id}`);
}

function unsupportedPattern(node, pattern, cx) {
  const statement = unsupportedStatement(node, cx, 'binding-pattern');
  const clobbers = [...new Set([...statement.clobbers, ...patternClobbers(pattern, cx)])].sort();
  return { ...statement, mutates: true, clobbers };
}

function declarationStatements(declaration, cx) {
  const loc = locationOf(cx.sourceFile, declaration);
  const value =
    declaration.initializer === undefined
      ? { kind: 'undefined' }
      : toExpr(declaration.initializer, cx);
  const local = cx.locals.get(declaration);
  if (local === undefined) {
    return [unsupportedStatement(declaration, cx, 'binding-pattern')];
  }
  const bind = { kind: 'bind', id: local.id, name: local.name, value, loc };
  if (ts.isIdentifier(declaration.name)) {
    return [bind];
  }
  if (!declaration.name.elements.every((element) => cx.locals.has(element))) {
    return [unsupportedPattern(declaration, declaration.name, cx)];
  }
  const source = { kind: 'local', id: local.id, name: local.name };
  return [
    bind,
    ...declaration.name.elements.map((element) => elementStatement(element, source, cx)),
  ];
}

function variableStatements(node, cx) {
  return node.declarationList.declarations.flatMap((declaration) =>
    declarationStatements(declaration, cx),
  );
}

function assignmentStatement(node, expression, cx) {
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

function expressionStatement(node, cx) {
  const expression = unwrap(node.expression);
  const assignment =
    ts.isBinaryExpression(expression) && ts.isAssignmentOperator(expression.operatorToken.kind);
  if (assignment && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return [assignmentStatement(node, expression, cx)];
  }
  if (assignment) {
    return [unsupportedStatement(node, cx, 'compound-assignment')];
  }
  return [{ kind: 'eval', value: toExpr(expression, cx), loc: locationOf(cx.sourceFile, node) }];
}

function ifStatement(node, cx) {
  const test = toExpr(node.expression, cx);
  const then = blockOf(node.thenStatement, cx);
  const otherwise = node.elseStatement === undefined ? [] : blockOf(node.elseStatement, cx);
  const testLoc = locationOf(cx.sourceFile, node.expression);
  return [
    { kind: 'if', test, testLoc, then, else: otherwise, loc: locationOf(cx.sourceFile, node) },
  ];
}

function completionStatement(node, cx) {
  const kind = ts.isReturnStatement(node) ? 'return' : 'throw';
  const value = node.expression === undefined ? { kind: 'undefined' } : toExpr(node.expression, cx);
  return [{ kind, value, loc: locationOf(cx.sourceFile, node) }];
}

function catchField(element, cx) {
  return [cx.locals.get(element).id, (element.propertyName ?? element.name).text];
}

function tryStatement(node, cx) {
  if (node.finallyBlock !== undefined || node.catchClause === undefined) {
    return [unsupportedStatement(node, cx, 'finally')];
  }
  const declaration = node.catchClause.variableDeclaration;
  const local = declaration === undefined ? undefined : cx.locals.get(declaration);
  const pattern = declaration !== undefined && !ts.isIdentifier(declaration.name);
  if (pattern && !declaration.name.elements.every((element) => cx.locals.has(element))) {
    return [unsupportedPattern(node, declaration.name, cx)];
  }
  const handler = blockOf(node.catchClause.block, cx);
  const body = blockOf(node.tryBlock, cx);
  const fields = pattern ? declaration.name.elements.map((element) => catchField(element, cx)) : [];
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

const HANDLERS = [
  [ts.isVariableStatement, variableStatements],
  [ts.isExpressionStatement, expressionStatement],
  [ts.isIfStatement, ifStatement],
  [ts.isReturnStatement, completionStatement],
  [ts.isThrowStatement, completionStatement],
  [ts.isTryStatement, tryStatement],
  [ts.isBlock, (node, cx) => statementsOf(node.statements, cx)],
  [ts.isEmptyStatement, () => []],
];

function statementOf(node, cx) {
  if (LOOPS.some((test) => test(node))) {
    return [unsupportedStatement(node, cx, 'loop')];
  }
  const handler = HANDLERS.find(([test]) => test(node));
  return handler === undefined
    ? [unsupportedStatement(node, cx, ts.SyntaxKind[node.kind])]
    : handler[1](node, cx);
}

function statementsOf(nodes, cx) {
  return nodes.flatMap((node) => statementOf(node, cx));
}

function blockOf(node, cx) {
  return ts.isBlock(node) ? statementsOf(node.statements, cx) : statementOf(node, cx);
}

export function bodyOf(fn, cx) {
  if (ts.isBlock(fn.body)) {
    return statementsOf(fn.body.statements, cx);
  }
  return [{ kind: 'return', value: toExpr(fn.body, cx), loc: locationOf(cx.sourceFile, fn.body) }];
}
