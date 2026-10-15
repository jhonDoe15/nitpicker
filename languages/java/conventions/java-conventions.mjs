const OPENS_BLOCK = /\{\s*$/;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

export const JAVA_INDENTATION = {
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
  for (let index = 1; index < lines.length; index += 1) {
    if (OPENS_BLOCK.test(lines[index - 1]) && !lines[index].startsWith('\t')) {
      const step = leadingSpaces(lines[index]) - leadingSpaces(lines[index - 1]);
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

function leadingSpaces(line) {
  return line.length - line.trimStart().length;
}
