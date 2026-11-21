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
import { sourceRoots, testRoots } from '../../../languages/typescript/preset/layout.mts';
import { stylingApproaches } from '../../../languages/typescript/preset/eslint-config/react/react-rules.mts';
import { ALLOW_KEYS, TEST_CONSOLE_KEYS } from '../scopes/scope-settings.mts';
import { LAYOUT_KEYS } from '../scopes/layout-settings.mts';
import { CUSTOM_ANALYZER_KEYS, I18N_KEYS, REACT_KEYS } from '../validate.mts';
import {
  directory,
  enumeration,
  nonEmptyString,
  sourceDirectory,
  ref,
  scope,
  stringArray,
  type JsonSchema,
} from './schema-parts.mts';
import type { SchemaTable, TextTable } from '../views/schema-views.mts';

const FILES = FILE_LIMIT_DEFAULTS;
const CLASSES = CLASS_LIMIT_DEFAULTS;
const DEPTHS = FOLDER_DEPTH_DEFAULTS;

const THRESHOLD_DESCRIPTIONS: TextTable = {
  crapLimit: `A function whose CRAP score is at or above this fails (default ${String(DEFAULT_CRAP_SCORE_LIMIT)}).`,
  fileLines: `Lines per source file (default ${String(FILES.fileLines)}).`,
  testFileLines: `Lines per test file (default ${String(FILES.testFileLines)}).`,
  lineLength: `Characters per line (default ${String(FILES.lineLength)}).`,
  folderFiles: `Source files, and separately test files, directly in one folder (default ${String(FILES.folderFiles)}).`,
  folderDepth: `Folders below the feature layer (TypeScript, JavaScript; default ${String(DEPTHS.typescript)}) or packages below the root package (default ${String(DEPTHS.java)} for Java and Kotlin, ${String(DEPTHS.python)} for Python).`,
  classMethods: `Methods per class (TypeScript, JavaScript, Java, Kotlin, Python; default ${String(CLASSES.classMethods)}).`,
  classFields: `Instance fields per class (TypeScript, JavaScript, Java, Kotlin, Python; default ${String(CLASSES.classFields)}).`,
  inheritanceDepth: `Superclasses per class (TypeScript, JavaScript, Java, Kotlin, Python; default ${String(CLASSES.inheritanceDepth)}).`,
  unitTestSeconds: `Seconds one unit test the change adds or edits may take (default ${String(TEST_TIME_DEFAULTS.unitTestSeconds)}).`,
  integrationTestSeconds: `Seconds one integration test the change adds or edits may take (default ${String(TEST_TIME_DEFAULTS.integrationTestSeconds)}).`,
};

const LAYOUT_DESCRIPTIONS: TextTable = {
  sourceRoots: `Directories with the production code (TypeScript, JavaScript; default ${JSON.stringify(sourceRoots)}).`,
  testRoots: `Directories with the tests (TypeScript, JavaScript; default ${JSON.stringify(testRoots)}).`,
  excludedGlobs: 'Globs that replace the built-in exclusions (TypeScript, JavaScript).',
  entryPoints:
    'Globs of files that are started or loaded by path and so are never imported (TypeScript, JavaScript).',
  sharedRoots:
    'Folder globs of shared code: a module there that only one feature uses is reported.',
  featureRoots: 'Folder globs whose direct subfolders are one feature each; [] turns the rule off.',
};

const LAYOUT_SCHEMAS: SchemaTable = {
  sourceRoots: { type: 'array', minItems: 1, items: sourceDirectory },
  testRoots: { type: 'array', minItems: 1, items: directory },
  excludedGlobs: { type: 'array', items: nonEmptyString },
  entryPoints: { type: 'array', items: nonEmptyString },
  sharedRoots: { type: 'array', items: ref('folderGlob') },
  featureRoots: { type: 'array', items: ref('folderGlob') },
};

function described(
  descriptions: TextTable,
  schemas: SchemaTable = {},
): (key: string) => JsonSchema {
  return (key: string) => ({ description: descriptions[key], ...schemas[key] });
}

export const thresholds = {
  description: 'Size and time limits, replacing the preset defaults.',
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

function enabled(what: string): JsonSchema {
  return {
    description: `true or false forces the ${what} on or off; without it nitpicker decides from the project's dependencies.`,
    type: 'boolean',
  };
}

export const react = scope(
  'The React rule scope (TypeScript and JavaScript presets).',
  REACT_KEYS,
  {
    enabled: enabled('React rules'),
    styling: enumeration(
      'The one styling approach the project uses; inferred from the sources when unset.',
      stylingApproaches,
    ),
  },
);

export const i18n = scope(
  'The i18n rule scope for react-intl (TypeScript preset only).',
  I18N_KEYS,
  {
    enabled: enabled('i18n rules'),
    functionNames: stringArray('Wrappers of formatMessage that are checked too.'),
    componentNames: stringArray('Wrappers of FormattedMessage that are checked too.'),
  },
);

const allowEntryProperties: SchemaTable = {
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

const analyzerProperties: SchemaTable = {
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
