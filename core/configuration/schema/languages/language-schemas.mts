import { JAVA_KEYS } from '../../../../languages/java/builds/build-tool/build-tool-setting.mts';
import { JAVA_BUILD_TOOLS } from '../../../../languages/java/builds/java-build.mts';
import {
  KOTLIN_FORMATTERS,
  KOTLIN_KEYS,
} from '../../../../languages/java/adapters/kotlin/kotlin-options.mts';
import {
  ENVIRONMENTS,
  FORMATTERS as PYTHON_FORMATTERS,
  PYTHON_TEST_RUNNERS,
  SETTING_KEYS,
  TYPE_CHECKERS,
  WINDOWS_ABSOLUTE,
} from '../../../../languages/python/adapters/configuration/python-config.mts';
import {
  BUILD_TAG,
  GO_SETTING_KEYS,
} from '../../../../languages/go/adapters/configuration/go-config.mts';
import { FORMATTERS as GO_FORMATTERS } from '../../../../languages/go/adapters/formatting/go-formatters.mts';
import { enumeration, nonEmptyString, projectPath, scope, stringArray } from '../schema-parts.mts';
import {
  exceptionList,
  pathProblemRestriction,
  pythonOwnRestriction,
} from '../exception-schema.mts';

const pythonProperties = {
  environment: {
    description:
      'The tool that manages the environment, or the directory of a virtual environment.',
    anyOf: [{ enum: ENVIRONMENTS }, { pattern: `^/|${WINDOWS_ABSOLUTE.source}` }, projectPath],
  },
  formatter: enumeration('The format check to run.', PYTHON_FORMATTERS),
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
  blockingGetters: {
    description:
      'Synchronous getters that block an async function, as method names (`get_connection`) or ' +
      'dotted names (`hooks.base.get_connection`); Airflow `get_connection` is built in.',
    type: 'array',
    items: nonEmptyString,
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

export const java = scope('Java and Kotlin build settings (java and kotlin presets).', JAVA_KEYS, {
  buildTool: enumeration(
    'The build tool when the project has both a pom.xml and a Gradle build: "maven" or "gradle". ' +
      'Without it nitpicker picks Gradle, or Maven when mvnw exists and gradlew does not.',
    JAVA_BUILD_TOOLS,
  ),
  analyzeGeneratedSources: {
    description:
      'Set to true to also analyze generated sources (build-directory roots such as protobuf output, ' +
      'and annotation processor output); default false.',
    type: 'boolean',
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
