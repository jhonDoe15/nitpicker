import { JAVA_LINE_LENGTH } from '../../../../shared/project-rules/size-rules.mjs';
import { evaluateFileLimits } from '../../../../shared/rules/file-limits.mjs';
import { callUntyped, findingsOf, type JavaFinding } from '../typed/java-values.mts';

type LineLengthFile = { readonly path: string; readonly text: string };

type LineLengthOptions = {
  readonly analyzerName: string;
  readonly exceptions?: unknown;
  readonly lineLength?: number;
};

const TEXT_BLOCK_DELIMITER = /"""/gu;

export function maskTextBlocks(text: string): string {
  let inside = false;
  return text
    .split('\n')
    .map((line) => {
      const masked = inside ? '' : line;
      const delimiters = (line.match(TEXT_BLOCK_DELIMITER) ?? []).length;
      inside = delimiters % 2 === 1 ? !inside : inside;
      return masked;
    })
    .join('\n');
}

export function javaLineLengthFindings(
  files: readonly LineLengthFile[],
  { analyzerName, exceptions, lineLength = JAVA_LINE_LENGTH }: LineLengthOptions,
): JavaFinding[] {
  const findings: unknown = callUntyped(
    evaluateFileLimits,
    files.map((file) => ({ ...file, text: maskTextBlocks(file.text) })),
    {
      analyzerName,
      exceptions,
      thresholds: { lineLength },
      checks: ['lineLength'],
    },
  );
  return findingsOf(findings);
}
