import type TypeScript from 'typescript';
import type { EslintMessage } from '../typed/engine.mts';
import { positiveInteger } from '../arguments.mts';

export type Positions = {
  readonly line: number;
  readonly column: number;
  readonly sourcePosition: number;
  readonly endPosition: number | undefined;
};

export function reportedPositions(
  message: EslintMessage,
  context: string,
  sourceFile: TypeScript.SourceFile,
): Positions {
  const line = positiveInteger(message.line, `${context}.line`);
  const column = positiveInteger(message.column, `${context}.column`);
  const sourcePosition = sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1);
  const endPosition =
    message.endLine === undefined || message.endColumn === undefined
      ? undefined
      : sourceFile.getPositionOfLineAndCharacter(
          positiveInteger(message.endLine, `${context}.endLine`) - 1,
          positiveInteger(message.endColumn, `${context}.endColumn`) - 1,
        );
  return { line, column, sourcePosition, endPosition };
}
