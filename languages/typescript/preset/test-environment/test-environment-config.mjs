import { nitpickerRules } from '../eslint-plugin/index.mjs';
import { codeExtensions } from '../layout.mjs';
import { TEST_ENVIRONMENTS_VARIABLE, TEST_ENVIRONMENT_RULE } from './resolve-environment.mjs';

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

function environmentBlock({ files, ignores = [], environment, setupFiles = [] }, aliases, layout) {
  return {
    files,
    ignores: [...layout.excludedGlobs, ...ignores],
    plugins: { nitpicker: nitpickerRules },
    rules: { [TEST_ENVIRONMENT_RULE]: ['error', { environment, aliases, setupFiles }] },
  };
}

export function testEnvironmentConfigFor(
  layout,
  { environment, scopes, aliases = [], setupFiles = [] },
) {
  const files = runnableTestGlobs(layout);
  return [
    environmentBlock({ files, environment, setupFiles }, aliases, layout),
    ...scopes.map((scope) => environmentBlock(scope, aliases, layout)),
  ];
}
