import globals from 'globals';
import { restrictedBrowserGlobals } from '../eslint-config/react/react-rules.mjs';
import { productionScope } from '../eslint-config/scope-support.mjs';
import { domainGlobsFor } from '../eslint-config/strict/strict-domain.mjs';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import {
  TEST_ENVIRONMENTS_VARIABLE,
  TEST_ENVIRONMENT_RULE,
  isDomEnvironment,
} from './environments.mjs';

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

function environmentBlock({ files, ignores = [], environment, setupFiles = [] }, context) {
  const { aliases, layout, runner, globalDom } = context;
  return {
    files,
    ignores: [...layout.excludedGlobs, ...ignores],
    ...(isDomEnvironment(environment) ? { languageOptions: { globals: globals.browser } } : {}),
    plugins: { nitpicker: nitpickerRules },
    rules: {
      [TEST_ENVIRONMENT_RULE]: [
        'error',
        {
          environment,
          aliases,
          setupFiles,
          ...(runner === undefined ? {} : { runner }),
          ...(globalDom === undefined ? {} : { globalDom }),
        },
      ],
    },
  };
}

export function testEnvironmentConfigFor(
  layout,
  { environment, scopes, aliases = [], setupFiles = [], globalDom },
  runner,
) {
  const files = layout.runnableTestGlobs;
  const context = { aliases, layout, runner, globalDom };
  return [
    environmentBlock({ files, environment, setupFiles }, context),
    ...scopes.map((scope) => environmentBlock(scope, context)),
  ];
}

export function domProductionConfigFor(layout, { environment, scopes }) {
  const environments = [environment, ...scopes.map((scope) => scope.environment)];
  if (!environments.some(isDomEnvironment)) {
    return [];
  }
  const production = productionScope(layout);
  return [
    { ...production, languageOptions: { globals: globals.browser } },
    {
      files: [...production.files, ...production.ignores],
      ignores: [...layout.excludedGlobs, ...domainGlobsFor(layout.sourceRoots)],
      rules: { 'no-restricted-globals': restrictedBrowserGlobals },
    },
  ];
}
