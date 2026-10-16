import { leadingSpaces, majorityStep } from '../../../shared/conventions/lines.mjs';
import { testStaticImports, wildcardImports } from './java-imports.mjs';

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

export const JAVA_WILDCARD_IMPORTS = 'java.wildcardImports';
export const JAVA_TEST_STATIC_IMPORTS = 'java.testStaticImports';

const JAVA_FILES = ['**/*.java'];

const JAVA_IMPORTS = {
  id: JAVA_WILDCARD_IMPORTS,
  label: 'Java imports',
  options: ['explicit', 'wildcard'],
  optionLabels: { explicit: 'explicit only', wildcard: 'wildcards allowed' },
  fallback: 'explicit',
  files: JAVA_FILES,
  measure: wildcardImports,
};

const JAVA_TEST_STATIC = {
  id: JAVA_TEST_STATIC_IMPORTS,
  label: 'Java static imports in tests',
  options: ['explicit', 'wildcard'],
  optionLabels: { explicit: 'explicit only', wildcard: 'wildcards allowed' },
  fallback: 'explicit',
  files: ['**/src/*{test,Test}*/**/*.java'],
  measure: testStaticImports,
};

export const JAVA_CONVENTIONS = [JAVA_INDENTATION, JAVA_IMPORTS, JAVA_TEST_STATIC];

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
