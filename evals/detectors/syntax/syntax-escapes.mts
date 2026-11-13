import type typescript from 'typescript';
import { type Node, type SourceFile, ts } from '../typescript.mts';

export type Add = (kind: string, node: Node, signature: string, detail: string) => void;

export function collectTypeEscapes(node: Node, sourceFile: SourceFile, add: Add): void {
  if (ts.isAsExpression(node) && !ts.isConstTypeReference(node.type)) {
    const type = node.type.getText(sourceFile);
    add('type-assertion', node, type, `type assertion: as ${type}`);
  } else if (ts.isTypeAssertionExpression(node) && !ts.isConstTypeReference(node.type)) {
    const type = node.type.getText(sourceFile);
    add('type-assertion', node, type, `type assertion: <${type}>`);
  } else if (node.kind === ts.SyntaxKind.AnyKeyword) {
    add('any', node, 'any', 'any type');
  } else if (ts.isNonNullExpression(node)) {
    const expression = node.expression.getText(sourceFile);
    add('non-null-assertion', node, expression, `non-null assertion: ${expression}!`);
  }
}

export function collectNonPreferred(node: Node, add: Add): void {
  function report(construct: string): void {
    add('non-preferred-construct', node, construct, construct);
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const name = node.expression.name.text;
    if (name === 'forEach') {
      report('forEach');
    } else if (name === 'then') {
      report('.then() chain');
    }
  } else if (ts.isForStatement(node)) {
    report('for(;;) loop');
  } else if (ts.isForInStatement(node)) {
    report('for...in loop');
  } else if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
    report('while loop');
  } else if (ts.isEnumDeclaration(node)) {
    report('enum');
  } else if (ts.isModuleDeclaration(node) && !ts.isStringLiteral(node.name)) {
    report('namespace');
  } else if (ts.isInterfaceDeclaration(node)) {
    report('interface');
  }
}

export function collectIgnoredErrors(node: Node, add: Add): void {
  if (ts.isCatchClause(node) && doesNothing(node.block.statements)) {
    add('ignored-error', node, 'catch', 'catch block ignores the error');
  } else if (isIgnoringCatchCall(node)) {
    add('ignored-error', node, '.catch', '.catch() handler ignores the error');
  }
}

function isIgnoringCatchCall(node: Node): boolean {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.name.text !== 'catch' ||
    node.arguments.length !== 1
  ) {
    return false;
  }
  const [handler] = node.arguments;
  return handler !== undefined && isNoopHandler(handler);
}

function isUndefinedLike(expression: Node | undefined): boolean {
  return (
    expression === undefined ||
    expression.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(expression) && expression.text === 'undefined') ||
    (ts.isVoidExpression(expression) && ts.isNumericLiteral(expression.expression))
  );
}

function doesNothing(statements: readonly typescript.Statement[]): boolean {
  return statements.every(
    (statement) =>
      ts.isEmptyStatement(statement) ||
      ts.isContinueStatement(statement) ||
      ts.isBreakStatement(statement) ||
      (ts.isReturnStatement(statement) && isUndefinedLike(statement.expression)),
  );
}

function isNoopHandler(handler: Node): boolean {
  if (ts.isIdentifier(handler)) {
    return /^(?:noop|ignore)$/i.test(handler.text);
  }
  if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) {
    return false;
  }
  if (ts.isBlock(handler.body)) {
    return doesNothing(handler.body.statements);
  }
  return isUndefinedLike(handler.body);
}
