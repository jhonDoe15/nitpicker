import { describe, expect, it } from 'vitest';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { monorepoRefusal } from './refusal.mjs';

const git = useGitFixtures();

function refuse(files, argumentList = [], folder = '.') {
  const { root } = git.createGitRepository(files, { prefix: 'nitpicker-refusal-' });
  const output = captureOutput();
  const code = monorepoRefusal(
    {
      arguments_: argumentList,
      currentProjectRoot: folder === '.' ? root : `${root}/${folder}`,
      stderr: output.stderr,
    },
    'aggregate',
  );
  return { code, err: output.stderrText };
}

const FILES = {
  'nitpicker.config.json': '{"projects":["a","b"]}',
  'a/package.json': '{}',
  'b/package.json': '{}',
};

describe('monorepoRefusal', () => {
  it('refuses at the top of a monorepo and says to run inside a project', () => {
    const { code, err } = refuse(FILES);

    expect(code).toBe(2);
    expect(err.replace(/ and \S+ holds/u, ' and <root> holds')).toBe(
      'nitpicker: "aggregate" works on one project, and <root> holds 2 (a, b). ' +
        'Run it inside each project instead: cd <project> && nitpicker aggregate ...\n',
    );
  });

  it('lets a project through', () => {
    expect(refuse(FILES, [], 'a').code).toBeUndefined();
  });

  it('lets help through', () => {
    expect(refuse(FILES, ['--help']).code).toBeUndefined();
  });

  it('lets a single project repository through', () => {
    expect(refuse({ 'package.json': '{}' }).code).toBeUndefined();
  });

  it('leaves a configuration error to the command itself', () => {
    expect(refuse({ 'nitpicker.config.json': '{"colour":1}' }).code).toBeUndefined();
  });
});
