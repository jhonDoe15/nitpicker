import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { expect } from 'vitest';

export type Manifest = { version: string; dependency: (name: string) => string };
export type CommandResult = { status: SpawnSyncReturns<string>['status']; output: string };
type Run = (cwd: string, executable: string, args: string[]) => CommandResult;

const ESLINT_PLUGINS = [
  '@eslint/js',
  '@vitest/eslint-plugin',
  'eslint-plugin-formatjs',
  'eslint-plugin-functional',
  'eslint-plugin-jsx-a11y-x',
  'eslint-plugin-react-dom',
  'eslint-plugin-react-hooks',
  'eslint-plugin-react-web-api',
  'eslint-plugin-react-x',
  'eslint-plugin-regexp',
  'eslint-plugin-testing-library',
  'typescript-eslint',
];

export function eslintVersionOf(manifest: Manifest): (typeScriptVersion: string) => string {
  const plugins = ESLINT_PLUGINS.map((name) => `${name}@${manifest.dependency(name)}`);
  return function expectedEslintVersion(typeScriptVersion: string): string {
    return (
      `eslint@${manifest.dependency('eslint')};typescript@${typeScriptVersion};` +
      `plugins:${[...plugins, `nitpicker-plugin@${manifest.version}`].join(',')};` +
      `oxlint@${manifest.dependency('oxlint')},oxlint-tsgolint@${manifest.dependency('oxlint-tsgolint')}`
    );
  };
}

export function consumerCommands(environment: Record<string, string | undefined>): {
  command: Run;
  checked: (...run: Parameters<Run>) => string;
} {
  function command(cwd: string, executable: string, args: string[]): CommandResult {
    const result = spawnSync(executable, args, {
      cwd,
      encoding: 'utf8',
      env: environment,
      timeout: 180_000,
    });
    if (result.error) {
      throw result.error;
    }
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  }
  function checked(cwd: string, executable: string, args: string[]) {
    const result = command(cwd, executable, args);
    expect(result.status, `${executable} ${args.join(' ')}\n${result.output}`).toBe(0);
    return result.output.trim();
  }
  return { command, checked };
}
