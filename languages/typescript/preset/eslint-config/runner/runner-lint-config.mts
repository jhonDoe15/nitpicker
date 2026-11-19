import type { ESLint, Linter } from 'eslint';
import { testRunnerLintConfig as untypedTestRunnerLintConfig } from './runner-rules.mjs';

export type RunnerLintConfig = {
  readonly plugins: Readonly<Record<string, ESLint.Plugin>>;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly globals: Readonly<Record<string, boolean | 'readonly' | 'writable'>>;
  readonly rules: Linter.RulesRecord;
  readonly typedRules: Linter.RulesRecord;
};

export const testRunnerLintConfig: (
  runner: string,
  assertionHelpers: string[],
) => RunnerLintConfig = untypedTestRunnerLintConfig;
