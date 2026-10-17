import { leadingSpaces, majorityStep } from '../../../shared/conventions/lines.mjs';

const OPENS_BLOCK = /\{\s*(?:\/\/.*)?$/;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

const JAVA_INDENTATION = {
  id: 'java.indentation',
  label: 'Java indentation',
  options: ['2', '4'],
  optionLabels: { 2: '2 spaces (google-java-format)', 4: '4 spaces (google-java-format --aosp)' },
  fallback: '2',
  files: ['**/*.java'],
  measure: indentationStep,
};

export const JAVA_CONVENTIONS = [JAVA_INDENTATION];

export function indentationStep(text) {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !COMMENT_LINE.test(line));
  const steps = lines.slice(1).flatMap((line, index) => {
    const previous = lines[index];
    return OPENS_BLOCK.test(previous) && !line.startsWith('\t')
      ? [leadingSpaces(line) - leadingSpaces(previous)]
      : [];
  });
  return majorityStep(steps);
}
