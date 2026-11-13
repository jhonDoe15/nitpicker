import {
  assertionEvidence,
  followedHelpers,
  MIN_FILES,
  SAMPLE_LIMIT,
  testAndSupportGlobs,
} from './measures/assertion-helpers.mjs';
import { COLUMNS } from '../../../shared/conventions/settings.mjs';
import { FORMATTER_VERSION } from './build-style/java-formatter-options.mjs';
import { formatterProfile, javaIndentation, javaLineLength } from './measures/java-layout.mjs';
import { TEST_SOURCE_GLOB, testStaticImports, wildcardImports } from './measures/java-imports.mjs';

const JAVA_FILE_GLOB = '**/*.java';

export const JAVA_INDENTATION_ID = 'java.indentation';
export const JAVA_FORMATTER = 'java.formatter';
export const JAVA_LINE_LENGTH_ID = 'java.lineLength';
export const JAVA_FORMATTER_VERSION = 'java.formatterVersion';
export const JAVA_FORMATTER_OPTIONS = 'java.formatterOptions';

const JAVA_INDENTATION = {
  id: JAVA_INDENTATION_ID,
  label: 'Java indentation',
  options: ['2', '4', 'tab'],
  optionLabels: { 2: '2 spaces', 4: '4 spaces', tab: 'tabs' },
  fallback: '2',
  files: [JAVA_FILE_GLOB],
  measure: javaIndentation,
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
  minVotes: 3,
  strictMajority: true,
  files: [JAVA_FILE_GLOB],
  measure: formatterProfile,
};

const JAVA_FORMATTER_VERSIONS = {
  id: JAVA_FORMATTER_VERSION,
  label: 'Java formatter version',
  options: ['pinned'],
  optionLabels: { pinned: 'the version nitpicker pins' },
  valuePattern: FORMATTER_VERSION,
  range: 'a version such as "2.90.0"',
  fallback: 'pinned',
  hidden: true,
  nameOnly: true,
  files: [JAVA_FILE_GLOB],
  measure: () => undefined,
};

const JAVA_FORMATTER_FLAGS = {
  id: JAVA_FORMATTER_OPTIONS,
  label: 'Java formatter options',
  kind: 'names',
  fallback: [],
  hidden: true,
  nameOnly: true,
  files: [JAVA_FILE_GLOB],
  measure: () => [],
};

const JAVA_LINE_WIDTH = {
  id: JAVA_LINE_LENGTH_ID,
  label: 'Java line length',
  options: ['100', '120', '140'],
  optionLabels: { 100: '100 columns', 120: '120 columns', 140: '140 columns' },
  fallback: '100',
  ...COLUMNS,
  files: [JAVA_FILE_GLOB],
  measure: javaLineLength,
};

export const JAVA_WILDCARD_IMPORTS = 'java.wildcardImports';
export const JAVA_TEST_STATIC_IMPORTS = 'java.testStaticImports';
export const JAVA_ASSERTION_HELPERS = 'java.assertionHelpers';

const JAVA_FILES = [JAVA_FILE_GLOB];

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
  JAVA_FORMATTER_VERSIONS,
  JAVA_FORMATTER_FLAGS,
  JAVA_INDENTATION,
  JAVA_LINE_WIDTH,
  JAVA_IMPORTS,
  JAVA_TEST_STATIC,
  JAVA_ASSERTIONS,
];
