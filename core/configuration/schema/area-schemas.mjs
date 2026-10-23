import {
  DUPLICATES_KEYS,
  SKIPPED_FOLDER_NAME,
  THRESHOLD_KEYS,
  WHOLE_NUMBER_THRESHOLD_KEYS,
} from '../../../shared/config.mjs';
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
} from '../../../languages/python/adapters/configuration/python-config.mjs';
import {
  BINARY_NAME,
  SPRING_KEYS,
  SPRING_ROLES,
} from '../../../languages/java/adapters/spring-arch/spring-roles.mjs';
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

const THRESHOLD_DESCRIPTIONS = {
  crapLimit: 'A function whose CRAP score is at or above this fails (default 9).',
  fileLines: 'Lines per source file (default 300).',
  testFileLines: 'Lines per test file (default 500).',
  lineLength: 'Characters per line (default 120).',
  folderFiles: 'Source files, and separately test files, directly in one folder (default 6).',
  folderDepth:
    'Folders below the feature layer (TypeScript, JavaScript) or packages below the root package.',
  classMethods: 'Methods per class (Java, Kotlin, Python).',
  classFields: 'Instance fields per class (Java, Kotlin, Python).',
  inheritanceDepth: 'Superclasses per class (Java, Kotlin, Python).',
  unitTestSeconds: 'Seconds one unit test the change adds or edits may take (default 5).',
  integrationTestSeconds:
    'Seconds one integration test the change adds or edits may take (default 30).',
};

const LAYOUT_DESCRIPTIONS = {
  sourceRoots: 'Directories with the production code (TypeScript, JavaScript; default ["src"]).',
  testRoots: 'Directories with the tests (TypeScript, JavaScript).',
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
        ...(WHOLE_NUMBER_THRESHOLD_KEYS.has(key)
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

const enabled = (what) => ({
  description: `true or false forces the ${what} on or off; without it nitpicker decides from the project's dependencies.`,
  type: 'boolean',
});

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
    anyOf: [{ enum: ENVIRONMENTS }, { pattern: String.raw`^(?:/|[A-Za-z]:[\\/])` }, projectPath],
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

export const spring = scope('Spring settings (java and kotlin presets).', SPRING_KEYS, {
  roles: {
    description:
      'Annotation or type names, by role, whose classes count in that role for the Spring architecture rules, on top of Spring stereotypes. Removing a name loosens the policy.',
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(
      SPRING_ROLES.map((role) => [
        role,
        {
          description: `Binary names of annotations or types whose classes are a ${role}, such as "com.example.UseCase".`,
          type: 'array',
          items: { type: 'string', pattern: BINARY_NAME.source },
        },
      ]),
    ),
  },
});
