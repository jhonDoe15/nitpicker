import globals from 'globals';
import type { Layout } from '../../adapters/typed/head-policy.mts';
import type { EnvironmentScope, Environments } from './typed/environment-types.mts';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import {
  TEST_ENVIRONMENTS_VARIABLE,
  TEST_ENVIRONMENT_RULE,
  isDomEnvironment as untypedIsDomEnvironment,
} from './environments.mjs';

type RunnerLayout = Layout & { readonly runnableTestGlobs: readonly string[] };

type EnvironmentOptions = {
  readonly environment: string | undefined;
  readonly aliases: Environments['aliases'];
  readonly setupFiles: readonly string[];
  readonly runner?: string;
  readonly globalDom?: string;
};

type EnvironmentBlock = {
  readonly files: readonly string[];
  readonly ignores: string[];
  readonly languageOptions?: { readonly globals: Readonly<Record<string, boolean | string>> };
  readonly plugins: { readonly nitpicker: unknown };
  readonly rules: Readonly<Record<string, readonly ['error', EnvironmentOptions]>>;
};

type BlockContext = {
  readonly aliases: Environments['aliases'];
  readonly layout: RunnerLayout;
  readonly runner: string | undefined;
  readonly globalDom: string | undefined;
};

const isDomEnvironment: (environment: string | undefined) => boolean = untypedIsDomEnvironment;

const UNKNOWN: Environments = { environment: undefined, scopes: [] };

const parseEnvironments: (text: string) => Environments | undefined = JSON.parse;

function parseVariable(text: string): { parsed: Environments | undefined } {
  try {
    return { parsed: parseEnvironments(text) };
  } catch {
    return { parsed: undefined };
  }
}

export function testEnvironmentsFromVariables(variables: NodeJS.ProcessEnv): Environments {
  const { parsed } = parseVariable(variables[TEST_ENVIRONMENTS_VARIABLE] ?? 'null');
  if (!Array.isArray(parsed?.scopes)) {
    return UNKNOWN;
  }
  return Array.isArray(parsed.aliases) ? parsed : { ...parsed, aliases: [] };
}

function environmentBlock(
  { files, ignores = [], environment, setupFiles = [] }: EnvironmentScope,
  { aliases, layout, runner, globalDom }: BlockContext,
): EnvironmentBlock {
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
  layout: RunnerLayout,
  { environment, scopes, aliases = [], setupFiles = [], globalDom }: Environments,
  runner?: string,
): EnvironmentBlock[] {
  const files = layout.runnableTestGlobs;
  const context = { aliases, layout, runner, globalDom };
  return [
    environmentBlock({ files, environment, setupFiles }, context),
    ...scopes.map((scope) => environmentBlock(scope, context)),
  ];
}
