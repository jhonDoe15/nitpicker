import { nitpickerRules } from '../eslint-plugin/index.mjs';
import { codeExtensions } from '../layout.mjs';
import { TEST_ENVIRONMENTS_VARIABLE, TEST_ENVIRONMENT_RULE } from './environments.mjs';

const UNKNOWN = { environment: undefined, scopes: [] };

function parseVariable(text) {
  try {
    return { parsed: JSON.parse(text) };
  } catch {
    return { parsed: undefined };
  }
}

export function testEnvironmentsFromVariables(variables = process.env) {
  const { parsed } = parseVariable(variables[TEST_ENVIRONMENTS_VARIABLE] ?? 'null');
  if (!Array.isArray(parsed?.scopes)) return UNKNOWN;
  return Array.isArray(parsed.aliases) ? parsed : { ...parsed, aliases: [] };
}

function runnableTestGlobs(layout) {
  return [...layout.sourceRoots, ...layout.testRoots].map(
    (root) => `${root}/**/*.{test,spec}.${codeExtensions}`,
  );
}

function environmentBlock({ files, ignores = [], environment, setupFiles = [] }, context) {
  const { aliases, layout, runner } = context;
  return {
    files,
    ignores: [...layout.excludedGlobs, ...ignores],
    plugins: { nitpicker: nitpickerRules },
    rules: {
      [TEST_ENVIRONMENT_RULE]: [
        'error',
        { environment, aliases, setupFiles, ...(runner === undefined ? {} : { runner }) },
      ],
    },
  };
}

export function testEnvironmentConfigFor(
  layout,
  { environment, scopes, aliases = [], setupFiles = [] },
  runner,
) {
  const files = runnableTestGlobs(layout);
  const context = { aliases, layout, runner };
  return [
    environmentBlock({ files, environment, setupFiles }, context),
    ...scopes.map((scope) => environmentBlock(scope, context)),
  ];
}
