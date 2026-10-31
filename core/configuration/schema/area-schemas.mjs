import {
  DUPLICATES_KEYS,
  SKIPPED_FOLDER_NAME,
  THRESHOLD_KEYS,
  WHOLE_NUMBER_THRESHOLD_KEYS,
} from '../../../shared/config.mjs';
import {
  DEFAULT_CRAP_SCORE_LIMIT,
  FILE_LIMIT_DEFAULTS,
  TEST_TIME_DEFAULTS,
} from '../../../shared/policy.mjs';
import {
  CLASS_LIMIT_DEFAULTS,
  FOLDER_DEPTH_DEFAULTS,
} from '../../../shared/project-rules/size-rules.mjs';
import { sourceRoots, testRoots } from '../../../languages/typescript/preset/layout.mjs';
import { stylingApproaches } from '../../../languages/typescript/preset/eslint-config/react/react-rules.mjs';
import {
  KOTLIN_FORMATTERS,
  KOTLIN_KEYS,
} from '../../../languages/java/adapters/kotlin/kotlin-options.mjs';
import {
  ENVIRONMENTS,
  FORMATTERS,
  PYTHON_TEST_RUNNERS,
  SETTING_KEYS,
  TYPE_CHECKERS,
  WINDOWS_ABSOLUTE,
} from '../../../languages/python/adapters/configuration/python-config.mjs';
import {
  BUILD_TAG,
  GO_SETTING_KEYS,
} from '../../../languages/go/adapters/configuration/go-config.mjs';
import { FORMATTERS as GO_FORMATTERS } from '../../../languages/go/adapters/formatting/go-formatters.mjs';
import { ALLOW_KEYS, TEST_CONSOLE_KEYS } from '../scopes/scope-settings.mjs';
import { LAYOUT_KEYS } from '../scopes/layout-settings.mjs';
import { CUSTOM_ANALYZER_KEYS, I18N_KEYS, REACT_KEYS } from '../validate.mjs';
import {
  directory,
  enumeration,
  nonEmptyString,
  projectPath,
  ref,
  stringArray,
} from './schema-parts.mjs';
import {
  exceptionList,
  pathProblemRestriction,
  pythonOwnRestriction,
} from './exception-schema.mjs';

const FILES = FILE_LIMIT_DEFAULTS;
const CLASSES = CLASS_LIMIT_DEFAULTS;
const DEPTHS = FOLDER_DEPTH_DEFAULTS;

const THRESHOLD_DESCRIPTIONS = {
  crapLimit: `A function whose CRAP score is at or above this fails (default ${String(DEFAULT_CRAP_SCORE_LIMIT)}).`,
  fileLines: `Lines per source file (default ${String(FILES.fileLines)}).`,
  testFileLines: `Lines per test file (default ${String(FILES.testFileLines)}).`,
  lineLength: `Characters per line (default ${String(FILES.lineLength)}).`,
  folderFiles: `Source files, and separately test files, directly in one folder (default ${String(FILES.folderFiles)}).`,
  folderDepth: `Folders below the feature layer (TypeScript, JavaScript; default ${String(DEPTHS.typescript)}) or packages below the root package (default ${String(DEPTHS.java)} for Java and Kotlin, ${String(DEPTHS.python)} for Python).`,
  classMethods: `Methods per class (Java, Kotlin, Python; default ${String(CLASSES.classMethods)}).`,
  classFields: `Instance fields per class (Java, Kotlin, Python; default ${String(CLASSES.classFields)}).`,
  inheritanceDepth: `Superclasses per class (Java, Kotlin, Python; default ${String(CLASSES.inheritanceDepth)}).`,
  unitTestSeconds: `Seconds one unit test the change adds or edits may take (default ${String(TEST_TIME_DEFAULTS.unitTestSeconds)}).`,
  integrationTestSeconds: `Seconds one integration test the change adds or edits may take (default ${String(TEST_TIME_DEFAULTS.integrationTestSeconds)}).`,
};

const LAYOUT_DESCRIPTIONS = {
  sourceRoots: `Directories with the production code (TypeScript, JavaScript; default ${JSON.stringify(sourceRoots)}).`,
  testRoots: `Directories with the tests (TypeScript, JavaScript; default ${JSON.stringify(testRoots)}).`,
  excludedGlobs: 'Globs that replace the built-in exclusions (TypeScript, JavaScript).',
  entryPoints:
    'Globs of files that are started or loaded by path and so are never imported (TypeScript, JavaScript).',
  sharedRoots:
    'Folder globs of shared code: a module there that only one feature uses is reported.',
  featureRoots: 'Folder globs whose direct subfolders are one feature each; [] turns the rule off.',
};

const LAYOUT_SCHEMAS = {
  sourceRoots: { type: 'array', minItems: 1, items: directory },
  testRoots: { type: 'array', minItems: 1, items: directory },
  excludedGlobs: { type: 'array', items: nonEmptyString },
  entryPoints: { type: 'array', items: nonEmptyString },
  sharedRoots: { type: 'array', items: ref('folderGlob') },
  featureRoots: { type: 'array', items: ref('folderGlob') },
};

function described(descriptions, schemas = {}) {
  return (key) => ({ description: descriptions[key], ...schemas[key] });
}

export const thresholds = {
  description:
    'Size and time limits, replacing the preset defaults. A raised limit is a policy loosening.',
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(
    THRESHOLD_KEYS.map((key) => [
      key,
      {
        description: THRESHOLD_DESCRIPTIONS[key],
        ...(WHOLE_NUMBER_THRESHOLD_KEYS.includes(key)
          ? { type: 'integer', minimum: 1 }
          : { type: 'number', exclusiveMinimum: 0 }),
      },
    ]),
  ),
};

export const layout = {
  description: 'Where the code lives. The TypeScript and JavaScript presets take every key.',
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(
    LAYOUT_KEYS.map((key) => [key, described(LAYOUT_DESCRIPTIONS, LAYOUT_SCHEMAS)(key)]),
  ),
};

function scope(description, keys, properties) {
  return {
    description,
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(keys.map((key) => [key, properties[key]])),
  };
}

function enabled(what) {
  return {
    description: `true or false forces the ${what} on or off; without it nitpicker decides from the project's dependencies.`,
    type: 'boolean',
  };
}

export const react = scope('The React rule scope (TypeScript preset only).', REACT_KEYS, {
  enabled: enabled('React rules'),
  styling: enumeration(
    'The one styling approach the project uses; inferred from the sources when unset.',
    stylingApproaches,
  ),
});

export const i18n = scope(
  'The i18n rule scope for react-intl (TypeScript preset only).',
  I18N_KEYS,
  {
    enabled: enabled('i18n rules'),
    functionNames: stringArray('Wrappers of formatMessage that are checked too.'),
    componentNames: stringArray('Wrappers of FormattedMessage that are checked too.'),
  },
);

const allowEntryProperties = {
  contains: {
    description:
      'A fragment of the printed message. At least three characters must remain once numbers become <n> and ids become <id>.',
    type: 'string',
  },
  paths: {
    description: 'Test file globs that limit the entry; at least one.',
    type: 'array',
    minItems: 1,
    items: ref('fileGlob'),
  },
  reason: {
    description: 'Which library prints this and why it is acceptable.',
    type: 'string',
    pattern: String.raw`\S`,
  },
};

export const testConsole = scope(
  'The allowlist of the test console output check.',
  TEST_CONSOLE_KEYS,
  {
    allow: {
      description: 'Third-party console messages to accept.',
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['contains', 'reason'],
        properties: Object.fromEntries(ALLOW_KEYS.map((key) => [key, allowEntryProperties[key]])),
      },
    },
  },
);

export const duplicates = scope('The duplicate-code scan.', DUPLICATES_KEYS, {
  skippedFolders: {
    description:
      'Folder names (no slashes, commas, glob characters or leading "!") the scan skips at any depth. Replaces the built-in list.',
    type: 'array',
    uniqueItems: true,
    items: {
      type: 'string',
      pattern: SKIPPED_FOLDER_NAME.source,
      not: { pattern: String.raw`^(?:!|\.{1,2}$)` },
    },
  },
});

const analyzerProperties = {
  name: { description: 'The analyzer name, shown in reports.', ...nonEmptyString },
  command: { description: 'The command to run, relative to the project root.', ...nonEmptyString },
  args: stringArray('Arguments passed to the command.'),
};

export const analyzers = {
  description: 'Custom analyzers: commands that print a findings report.',
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'command'],
    properties: Object.fromEntries(
      CUSTOM_ANALYZER_KEYS.map((key) => [key, analyzerProperties[key]]),
    ),
  },
};

const pythonProperties = {
  environment: {
    description:
      'The tool that manages the environment, or the directory of a virtual environment.',
    anyOf: [{ enum: ENVIRONMENTS }, { pattern: `^/|${WINDOWS_ABSOLUTE.source}` }, projectPath],
  },
  formatter: enumeration('The format check to run.', FORMATTERS),
  testRunner: enumeration('The test runner.', PYTHON_TEST_RUNNERS),
  typeChecker: enumeration('The type checker.', TYPE_CHECKERS),
  importLinter: { description: 'false turns the import-linter check off.', type: 'boolean' },
  sourceRoots: {
    description: 'Directories with the production code.',
    type: 'array',
    minItems: 1,
    items: projectPath,
  },
  entryPoints: {
    description: 'Files that are started or loaded by path and so are never imported.',
    type: 'array',
    items: projectPath,
  },
  exceptions: exceptionList(
    'Exceptions for the Python rules that the top-level "exceptions" does not take.',
    [pythonOwnRestriction, pathProblemRestriction],
  ),
};

export const python = scope(
  'Overrides for what nitpicker detects in a Python project (python preset only).',
  SETTING_KEYS,
  pythonProperties,
);

export const kotlin = scope('Kotlin preset settings.', KOTLIN_KEYS, {
  formatter: enumeration('The format check to run; detected when absent.', KOTLIN_FORMATTERS),
  detektConfig: {
    description: 'Path of the detekt config inside the project; detected when absent.',
    ...projectPath,
  },
});

export const go = scope('Go preset settings.', GO_SETTING_KEYS, {
  formatters: {
    description:
      'The format checks to run; detected from go.mod and the golangci-lint config when absent.',
    type: 'array',
    minItems: 1,
    uniqueItems: true,
    items: { enum: GO_FORMATTERS },
  },
  buildTags: stringArray(
    'Build tags passed as -tags to go vet and go test, such as "integration".',
    {
      items: { type: 'string', pattern: BUILD_TAG.source },
    },
  ),
});
