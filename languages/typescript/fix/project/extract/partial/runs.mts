import type TypeScript from 'typescript';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';
import { childrenOf } from '../syntax.mts';
import type { LineSpan, Run, RunRegion, UnitNode } from '../typed/extract-types.mts';
import { statementWindows } from '../typed/typed-views.mts';

const ts = typescriptApi();

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

export function isFunctionLike(node: TypeScript.Node): boolean {
  return FUNCTION_LIKE.some((test) => test(node));
}

function statementLists(body: TypeScript.Node): TypeScript.NodeArray<TypeScript.Statement>[] {
  const lists: TypeScript.NodeArray<TypeScript.Statement>[] = [];
  const pending = [body];
  for (const node of pending) {
    if (ts.isBlock(node)) {
      lists.push(node.statements);
    }
    pending.push(...childrenOf(node).filter((child) => !isFunctionLike(child)));
  }
  return lists;
}

function lineAt(sourceFile: TypeScript.SourceFile, position: number): number {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function matches(window: Run, span: LineSpan, sourceFile: TypeScript.SourceFile): boolean {
  const start = lineAt(sourceFile, window[0].getStart(sourceFile));
  return start === span.start && lineAt(sourceFile, lastStatement(window).end) === span.end;
}

export function lastStatement(statements: Run): TypeScript.Statement {
  return statements.at(-1) ?? statements[0];
}

function runsOf(window: readonly TypeScript.Statement[]): Run[] {
  const [first, ...rest] = window;
  return first === undefined ? [] : [[first, ...rest]];
}

export function runStatements(
  unit: UnitNode,
  span: LineSpan,
  sourceFile: TypeScript.SourceFile,
): Run | undefined {
  if (unit.body === undefined || !ts.isBlock(unit.body)) {
    return undefined;
  }
  const found = statementLists(unit.body)
    .flatMap((list) => statementWindows(list).flatMap(runsOf))
    .filter((window) => matches(window, span, sourceFile));
  return found.length === 1 ? found[0] : undefined;
}

export function runRegion(statements: Run, sourceFile: TypeScript.SourceFile): RunRegion {
  return {
    pos: statements[0].pos,
    end: lastStatement(statements).end,
    start: statements[0].getStart(sourceFile),
  };
}
