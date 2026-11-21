import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkCommandOf } from './check-cli.mts';
import { commit, fixtureGit } from '../../diff/git/test-support/git-repository.mts';
import { useTempProjects } from '../../../shared/test-support/temp-projects.mts';
import { checkoutModuleUrl } from '../../../shared/paths/checkout-module.mts';

const project = useTempProjects('nitpicker-check-cli-');
const entryOf = (name: string): string =>
  fileURLToPath(checkoutModuleUrl(new URL(`../../${name}`, import.meta.url)));

function hygieneRun(entry: string, root: string) {
  const result = spawnSync(
    process.execPath,
    [entry, 'hygiene', '--check', 'repository-hygiene', '--project-root', root],
    { cwd: root, encoding: 'utf8' },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('check commands', () => {
  it('knows the hygiene and history commands and nothing else', () => {
    expect(['hygiene', 'history', 'go-analyzer', 'snapshot', ''].map(checkCommandOf)).toEqual([
      expect.any(Function),
      expect.any(Function),
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('reports the same hygiene findings through bin as through the full command line', () => {
    const root = project({
      'package.json': '{"name":"fixture"}\n',
      'src/index.ts': 'export const value = 1;\n',
      'keys/server.pem': '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
      'dist/bundle.js': 'console.log(1);\n',
    });
    fixtureGit(root, ['init', '-q', '--initial-branch=main']);
    commit(root, 'fixture');

    const throughBin = hygieneRun(entryOf('bin.mjs'), root);

    expect(throughBin).toEqual(hygieneRun(entryOf('cli.mjs'), root));
    expect(throughBin.status).toBe(0);
    expect(throughBin.stdout).toContain('repository-hygiene');
  });

  it('rejects an unknown command when the check entry runs alone', async () => {
    const { runCli } = await import('./check-cli.mts');

    await expect(runCli({ arguments_: ['snapshot'] })).rejects.toThrow(
      'Unknown check command: snapshot',
    );
  });
});
