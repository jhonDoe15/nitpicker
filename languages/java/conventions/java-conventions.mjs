import { leadingSpaces } from '../../../shared/conventions/lines.mjs';

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
  const steps = new Map();
  for (const [index, line] of lines.slice(1).entries()) {
    const previous = lines[index];
    if (OPENS_BLOCK.test(previous) && !line.startsWith('\t')) {
      const step = leadingSpaces(line) - leadingSpaces(previous);
      steps.set(step, (steps.get(step) ?? 0) + 1);
    }
  }
  const two = steps.get(2) ?? 0;
  const four = steps.get(4) ?? 0;
  if (two === four) {
    return undefined;
  }
  return two > four ? '2' : '4';
}
