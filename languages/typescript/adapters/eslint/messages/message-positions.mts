import type TypeScript from 'typescript';
import type { EslintMessage } from '../typed/engine.mts';
import { positiveInteger } from '../arguments.mts';

export type Positions = {
  readonly line: number;
  readonly column: number;
  readonly sourcePosition: number;
  readonly endPosition: number | undefined;
};

function positionOf(sourceFile: TypeScript.SourceFile, line: number, column: number): number {
  const lineStart = sourceFile.getPositionOfLineAndCharacter(line - 1, 0);
  return Math.min(lineStart + column - 1, sourceFile.getLineEndOfPosition(lineStart));
}

export function reportedPositions(
  message: EslintMessage,
  context: string,
  sourceFile: TypeScript.SourceFile,
): Positions {
  const line = positiveInteger(message.line, `${context}.line`);
  const column = positiveInteger(message.column, `${context}.column`);
  const sourcePosition = positionOf(sourceFile, line, column);
  const endPosition =
    message.endLine === undefined || message.endColumn === undefined
      ? undefined
      : positionOf(
          sourceFile,
          positiveInteger(message.endLine, `${context}.endLine`),
          positiveInteger(message.endColumn, `${context}.endColumn`),
        );
  return { line, column, sourcePosition, endPosition };
}
