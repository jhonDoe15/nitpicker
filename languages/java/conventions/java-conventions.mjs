import { leadingSpaces, majorityStep } from '../../../shared/conventions/lines.mjs';
import { assertionHelpers, MIN_FILES } from './measures/assertion-helpers.mjs';
import { testStaticImports, wildcardImports } from './measures/java-imports.mjs';

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
export const JAVA_ASSERTION_HELPERS = 'java.assertionHelpers';

export const TEST_SOURCE_GLOB = '**/src/*{test,Test}*/**/';

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
  files: [`${TEST_SOURCE_GLOB}*.java`],
  measure: testStaticImports,
};

const JAVA_ASSERTIONS = {
  id: JAVA_ASSERTION_HELPERS,
  label: 'Java assertion helpers',
  kind: 'names',
  minFiles: MIN_FILES,
  fallback: '',
  files: [`${TEST_SOURCE_GLOB}*.java`],
  measure: (text) => assertionHelpers(text, 'java'),
};

export const JAVA_CONVENTIONS = [JAVA_INDENTATION, JAVA_IMPORTS, JAVA_TEST_STATIC, JAVA_ASSERTIONS];

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
