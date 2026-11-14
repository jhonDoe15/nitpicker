import { statementWindows } from '../../../../../../shared/fix/recipes/extract/windows.mjs';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { childrenOf } from '../syntax.mjs';

const FUNCTION_LIKE = [
  ts.isFunctionDeclaration,
  ts.isMethodDeclaration,
  ts.isArrowFunction,
  ts.isFunctionExpression,
  ts.isConstructorDeclaration,
  ts.isGetAccessorDeclaration,
  ts.isSetAccessorDeclaration,
  ts.isClassLike,
];

export function isFunctionLike(node) {
  return FUNCTION_LIKE.some((test) => test(node));
}

function statementLists(unit) {
  const lists = [];
  const pending = [unit.body];
  for (const node of pending) {
    if (ts.isBlock(node)) {
      lists.push(node.statements);
    }
    pending.push(...childrenOf(node).filter((child) => !isFunctionLike(child)));
  }
  return lists;
}

function lineAt(sourceFile, position) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function matches(window, span, sourceFile) {
  const start = lineAt(sourceFile, window[0].getStart(sourceFile));
  return start === span.start && lineAt(sourceFile, window.at(-1).end) === span.end;
}

export function runStatements(unit, span, sourceFile) {
  if (!ts.isBlock(unit.body)) {
    return undefined;
  }
  const found = statementLists(unit)
    .flatMap((list) => statementWindows(list))
    .filter((window) => matches(window, span, sourceFile));
  return found.length === 1 ? found[0] : undefined;
}

export function runRegion(statements, sourceFile) {
  return {
    pos: statements[0].pos,
    end: statements.at(-1).end,
    start: statements[0].getStart(sourceFile),
  };
}
