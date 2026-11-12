import { describe, expect, it } from 'vitest';
import { runCli } from '../../cli.mts';
import { useCliFixtures } from '../../command/test-support/cli-harness.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { useProjects, withPeers } from '../test-support/projects.mjs';
import { assertProjectPeers } from './project-peers.mjs';

const project = useProjects();
const cli = useCliFixtures(runCli);
const PRESET = ['eslint-lint', 'coverage', 'prettier-format'].map((name) => ({
  name,
  policyFromPackage: true,
}));
const VITEST = { vitest: '4.1.11', '@vitest/coverage-v8': '4.1.11' };

function check(root, analyzers = PRESET, configuredRunner) {
  return () => {
    assertProjectPeers({ projectRoot: root, analyzers, configuredRunner, packageRoot: root });
  };
}

describe('the project peers a run needs', () => {
  it('lets a run start when every peer is installed', () => {
    expect(check(project(withPeers({ typescript: '6.0.3', ...VITEST })))).not.toThrow();
  });

  it.each([
    ['package-lock.json', 'npm install'],
    ['pnpm-lock.yaml', 'pnpm install'],
    ['yarn.lock', 'yarn install'],
    ['bun.lock', 'bun install'],
  ])('asks for a plain install when package.json declares the peers (%s)', (lockfile, install) => {
    const { 'package.json': manifest } = withPeers({ typescript: '6.0.3', ...VITEST });
    const root = project({ 'package.json': manifest, [lockfile]: '' }, { repository: true });

    expect(check(root)).toThrow(
      `typescript, vitest and @vitest/coverage-v8 are not installed in ${root}. Run ${install} (they are in package.json).`,
    );
  });

  it.each([
    ['package-lock.json', 'npm install --save-dev'],
    ['pnpm-lock.yaml', 'pnpm add --save-dev'],
    ['yarn.lock', 'yarn add --dev'],
    ['bun.lock', 'bun add --dev'],
  ])('names the packages to add when package.json lacks them (%s)', (lockfile, add) => {
    const root = project(
      { ...withPeers({ typescript: '6.0.3' }), [lockfile]: '' },
      { repository: true },
    );

    expect(check(root)).toThrow(
      `vitest and @vitest/coverage-v8 are not installed in ${root}. Run ${add} vitest @vitest/coverage-v8.`,
    );
  });

  it('takes a typescript that nitpicker loads from its own installation', () => {
    const root = project(withPeers(VITEST));
    const packageRoot = project(withPeers({ typescript: '6.0.3' }));
    const analyzers = PRESET;

    expect(() => {
      assertProjectPeers({ projectRoot: root, analyzers, packageRoot });
    }).not.toThrow();
  });

  it('says the command to add also installs the peers package.json declares', () => {
    const root = project({ 'package.json': '{"devDependencies":{"typescript":"^6"}}' });

    expect(check(root)).toThrow(
      `typescript, vitest and @vitest/coverage-v8 are not installed in ${root}. Run npm install --save-dev vitest @vitest/coverage-v8 (it also installs typescript from package.json).`,
    );
  });

  it('asks for a newer peer than the one installed', () => {
    const root = project(withPeers({ typescript: '5.6.3', ...VITEST }));

    expect(check(root)).toThrow(
      'typescript 5.6.3 is installed and nitpicker needs >=5.7. Run npm install --save-dev typescript.',
    );
  });

  it('asks for the packages of the configured runner only', () => {
    const root = project(withPeers({ typescript: '6.0.3' }));

    expect(check(root, PRESET, 'jest')).toThrow(
      `jest is not installed in ${root}. Run npm install --save-dev jest.`,
    );
    expect(check(root, PRESET, 'node')).not.toThrow();
  });

  it('asks for no test runner when no analyzer runs the tests', () => {
    const root = project({ 'package.json': '{}' });
    const analyzers = PRESET.filter(({ name }) => name !== 'coverage');

    expect(check(root, analyzers)).toThrow(
      `typescript is not installed in ${root}. Run npm install --save-dev typescript.`,
    );
  });

  it.each([
    ['Prettier alone', PRESET.filter(({ name }) => name === 'prettier-format')],
    ['analyzers of no preset', [{ name: 'eslint-lint' }]],
  ])('needs no peer for %s', (_name, analyzers) => {
    expect(check(project({ 'package.json': '{}' }), analyzers)).not.toThrow();
  });

  it('stops the gate before any analyzer starts', () => {
    const repository = cli.createRepository({ 'src/example.ts': 'export const example = 1;\n' });
    const output = captureOutput();
    const started = [];

    const exitCode = cli.runCli({
      arguments_: ['--base', 'comparison-base', '--output', cli.makeOutputRoot()],
      currentProjectRoot: repository.root,
      stdout: output.stdout,
      stderr: output.stderr,
      runTasks: (tasks) => {
        started.push(...tasks);
        return [];
      },
    });

    expect([exitCode, output.stdoutText, started]).toEqual([2, '', []]);
    expect(output.stderrText).toBe(
      `nitpicker failed: vitest and @vitest/coverage-v8 are not installed in ${repository.root}. Run npm install --save-dev vitest @vitest/coverage-v8.\n`,
    );
  });
});
