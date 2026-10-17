import {
  assertionEvidence,
  followedHelpers,
  MIN_FILES,
  SAMPLE_LIMIT,
  testAndSupportGlobs,
} from './measures/assertion-helpers.mjs';
import { formatterProfile, indentationStep, javaLineLength } from './measures/java-layout.mjs';
import { TEST_SOURCE_GLOB, testStaticImports, wildcardImports } from './measures/java-imports.mjs';

export const JAVA_INDENTATION_ID = 'java.indentation';
export const JAVA_FORMATTER = 'java.formatter';
export const JAVA_LINE_LENGTH_ID = 'java.lineLength';

const JAVA_INDENTATION = {
  id: JAVA_INDENTATION_ID,
  label: 'Java indentation',
  options: ['2', '4'],
  optionLabels: { 2: '2 spaces', 4: '4 spaces' },
  fallback: '2',
  files: ['**/*.java'],
  measure: indentationStep,
};

const JAVA_FORMATTERS = {
  id: JAVA_FORMATTER,
  label: 'Java formatter',
  options: ['google', 'palantir', 'none'],
  optionLabels: {
    google: 'google-java-format',
    palantir: 'palantir-java-format',
    none: 'no Java formatter runs',
  },
  fallback: 'google',
  files: ['**/*.java'],
  measure: formatterProfile,
};

const JAVA_LINE_WIDTH = {
  id: JAVA_LINE_LENGTH_ID,
  label: 'Java line length',
  options: ['100', '120', '140'],
  optionLabels: { 100: '100 columns', 120: '120 columns', 140: '140 columns' },
  fallback: '100',
  files: ['**/*.java'],
  measure: javaLineLength,
};

export const JAVA_WILDCARD_IMPORTS = 'java.wildcardImports';
export const JAVA_TEST_STATIC_IMPORTS = 'java.testStaticImports';
export const JAVA_ASSERTION_HELPERS = 'java.assertionHelpers';

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
  fallback: [],
  minFiles: MIN_FILES,
  sampleLimit: SAMPLE_LIMIT,
  files: testAndSupportGlobs('java'),
  measure: (text, file) => assertionEvidence(text, file, 'java'),
  choose: followedHelpers,
};

export const JAVA_CONVENTIONS = [
  JAVA_FORMATTERS,
  JAVA_INDENTATION,
  JAVA_LINE_WIDTH,
  JAVA_IMPORTS,
  JAVA_TEST_STATIC,
  JAVA_ASSERTIONS,
];
