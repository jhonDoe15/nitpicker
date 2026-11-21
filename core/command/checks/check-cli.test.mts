import { describe, expect, it } from 'vitest';
import { checkCommandOf, runCheckCli } from './check-cli.mts';
import { runCli } from '../../cli.mts';
import { commit, fixtureGit } from '../../diff/git/test-support/git-repository.mts';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mts';
import { useTempProjects } from '../../../shared/test-support/temp-projects.mts';

const project = useTempProjects('nitpicker-check-cli-');

function hygieneArguments(root: string): string[] {
  return ['hygiene', '--check', 'repository-hygiene', '--project-root', root];
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

  it('reports the same hygiene findings as the full command line', async () => {
    const root = project({
      'package.json': '{"name":"fixture"}\n',
      'src/index.ts': 'export const value = 1;\n',
      'keys/server.pem': '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    });
    fixtureGit(root, ['init', '-q', '--initial-branch=main']);
    commit(root, 'fixture');
    const light = captureOutput();
    const full = captureOutput();

    const lightExit = await runCheckCli({
      argv: ['node', 'bin.mjs', ...hygieneArguments(root)],
      env: { ...process.env },
      stdout: light.stdout,
      stderr: light.stderr,
    });
    const fullExit = await runCli({
      arguments_: hygieneArguments(root),
      environment: { ...process.env },
      stdout: full.stdout,
      stderr: full.stderr,
    });

    expect({ exit: lightExit, out: light.stdoutText, err: light.stderrText }).toEqual({
      exit: fullExit,
      out: full.stdoutText,
      err: full.stderrText,
    });
    expect(lightExit).toBe(0);
    expect(light.stdoutText).not.toBe('');
  });

  it('rejects an unknown command', async () => {
    const output = captureOutput();

    await expect(
      runCheckCli({ argv: ['node', 'bin.mjs', 'snapshot'], env: {}, ...output }),
    ).rejects.toThrow('Unknown check command: snapshot');
  });
});
