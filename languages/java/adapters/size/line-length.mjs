import { JAVA_LINE_LENGTH } from '../../../../shared/project-rules/size-rules.mjs';
import { evaluateFileLimits } from '../../../../shared/rules/file-limits.mjs';

const TEXT_BLOCK_DELIMITER = /"""/gu;

export function maskTextBlocks(text) {
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
  files,
  { analyzerName, exceptions, lineLength = JAVA_LINE_LENGTH },
) {
  return evaluateFileLimits(
    files.map((file) => ({ ...file, text: maskTextBlocks(file.text) })),
    {
      analyzerName,
      exceptions,
      thresholds: { lineLength },
      checks: ['lineLength'],
    },
  );
}
