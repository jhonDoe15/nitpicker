import { spawnSync } from 'node:child_process';
import { expect } from 'vitest';

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

export function eslintVersionOf(manifest) {
  const plugins = ESLINT_PLUGINS.map((name) => `${name}@${manifest.dependencies[name]}`);
  return function expectedEslintVersion(typeScriptVersion) {
    return (
      `eslint@${manifest.dependencies.eslint};typescript@${typeScriptVersion};` +
      `plugins:${[...plugins, `nitpicker-plugin@${manifest.version}`].join(',')};` +
      `oxlint@${manifest.dependencies.oxlint},oxlint-tsgolint@${manifest.dependencies['oxlint-tsgolint']}`
    );
  };
}

export function consumerCommands(environment) {
  function command(cwd, executable, args) {
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
  function checked(cwd, executable, args) {
    const result = command(cwd, executable, args);
    expect(result.status, `${executable} ${args.join(' ')}\n${result.output}`).toBe(0);
    return result.output.trim();
  }
  return { command, checked };
}
