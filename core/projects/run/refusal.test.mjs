import { describe, expect, it } from 'vitest';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { oneProjectScope } from './refusal.mjs';

const git = useGitFixtures();

function refuse(files, argumentList = [], folder = '.') {
  const { root } = git.createGitRepository(files, { prefix: 'nitpicker-refusal-' });
  const output = captureOutput();
  const scope = oneProjectScope(
    {
      arguments_: argumentList,
      ...(folder === '.'
        ? { currentProjectRoot: root }
        : { workingDirectory: `${root}/${folder}` }),
      stderr: output.stderr,
    },
    'aggregate',
  );
  return { root, scope, code: scope.exitCode, err: output.stderrText.replaceAll(root, '<root>') };
}

const FILES = {
  'nitpicker.config.json': '{"projects":["a","b"]}',
  'a/package.json': '{}',
  'b/package.json': '{}',
  'b/src/x.ts': '',
};

describe('oneProjectScope', () => {
  it('refuses at the top of a monorepo and says to run inside a project', () => {
    const { code, err } = refuse(FILES);

    expect([code, err]).toEqual([
      2,
      'nitpicker: "aggregate" works on one project, and <root> is a monorepo of 2 projects (a, b). ' +
        'Run it in a project folder (cd a && nitpicker aggregate ...), or set "projects": [] in the ' +
        'root nitpicker.config.json to gate the repository as one project.\n',
    ]);
  });

  it('lets a project through, and runs in the project that holds the folder', () => {
    expect(refuse(FILES, [], 'a').code).toBeUndefined();
    const inside = refuse(
      {
        'nitpicker.config.json': '{"projects":["a","py"]}',
        'a/package.json': '{}',
        'py/src/m.py': '',
      },
      [],
      'py/src',
    );
    expect(inside.scope).toEqual({
      currentProjectRoot: `${inside.root}/py`,
      configOverlay: { inherits: '..' },
    });
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
