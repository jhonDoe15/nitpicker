import type { Layout } from '../../adapters/typed/head-policy.mts';
import type { EnvironmentScope, Environments } from './environment-types.mts';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import { codeExtensions } from '../layout.mjs';
import { TEST_ENVIRONMENTS_VARIABLE, TEST_ENVIRONMENT_RULE } from './resolve-environment.mts';

type EnvironmentBlock = {
  readonly files: readonly string[];
  readonly ignores: string[];
  readonly plugins: { readonly nitpicker: unknown };
  readonly rules: Readonly<
    Record<
      string,
      readonly [
        'error',
        {
          readonly environment: string | undefined;
          readonly aliases: Environments['aliases'];
          readonly setupFiles: readonly string[];
        },
      ]
    >
  >;
};

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

function runnableTestGlobs(layout: Layout): string[] {
  return [...layout.sourceRoots, ...layout.testRoots].map(
    (root) => `${root}/**/*.{test,spec}.${codeExtensions}`,
  );
}

function environmentBlock(
  { files, ignores = [], environment, setupFiles = [] }: EnvironmentScope,
  aliases: Environments['aliases'],
  layout: Layout,
): EnvironmentBlock {
  return {
    files,
    ignores: [...layout.excludedGlobs, ...ignores],
    plugins: { nitpicker: nitpickerRules },
    rules: { [TEST_ENVIRONMENT_RULE]: ['error', { environment, aliases, setupFiles }] },
  };
}

export function testEnvironmentConfigFor(
  layout: Layout,
  { environment, scopes, aliases = [], setupFiles = [] }: Environments,
): EnvironmentBlock[] {
  const files = runnableTestGlobs(layout);
  return [
    environmentBlock({ files, environment, setupFiles }, aliases, layout),
    ...scopes.map((scope) => environmentBlock(scope, aliases, layout)),
  ];
}
