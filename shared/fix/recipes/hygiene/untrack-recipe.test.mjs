import { describe, expect, it } from 'vitest';
import { untrackCommittedFilesRecipe } from './untrack-recipe.mjs';

const TOOL = 'repository-hygiene';

function plan(findings, gitignore) {
  return untrackCommittedFilesRecipe.plan({
    read: (name) => (name === '.gitignore' ? gitignore : undefined),
    inputs: { hygiene: { findings } },
  }).fixes;
}

describe('untrackCommittedFilesRecipe', () => {
  it('is a review recipe of project scope that may write only the .gitignore', () => {
    expect([untrackCommittedFilesRecipe.safety, untrackCommittedFilesRecipe.scope]).toEqual([
      'review',
      'project',
    ]);
    expect([
      untrackCommittedFilesRecipe.accepts('.gitignore'),
      untrackCommittedFilesRecipe.accepts('.env'),
    ]).toEqual([true, false]);
  });

  it('plans nothing without findings', () => {
    expect(plan([], '')).toEqual([]);
    expect(untrackCommittedFilesRecipe.plan({ read: () => undefined, inputs: {} }).fixes).toEqual(
      [],
    );
  });

  it('ignores and untracks a committed file, and a folder named in the identity', () => {
    const fixes = plan(
      [
        { rule: 'committed-env-file', path: 'config/.env', identity: 'file:config/.env' },
        { rule: 'committed-binary', path: 'lib/a.jar', identity: 'file:lib/a.jar' },
        { rule: 'committed-build-output', path: 'package.json', identity: 'web/dist|build-output' },
      ],
      'node_modules\n',
    );

    expect(fixes.map(({ finding }) => finding)).toEqual([
      { tool: TOOL, rule: 'committed-env-file', path: 'config/.env', line: 1 },
      { tool: TOOL, rule: 'committed-binary', path: 'lib/a.jar', line: 1 },
      { tool: TOOL, rule: 'committed-build-output', path: 'package.json', line: 1 },
    ]);
    expect(fixes.map(({ edits }) => edits.map((edit) => edit.text ?? edit.path))).toEqual([
      ['/config/.env\n', 'config/.env'],
      ['/lib/a.jar\n', 'lib/a.jar'],
      ['/web/dist/\n', 'web/dist'],
    ]);
  });

  it('only untracks a path the .gitignore already covers', () => {
    const [fix] = plan(
      [{ rule: 'committed-env-file', path: '.env', identity: 'file:.env' }],
      '.env\n',
    );

    expect(fix.edits).toEqual([{ type: 'untrack', path: '.env' }]);
  });

  it('says a private key finding stays, because the key has to be rotated', () => {
    const [fix] = plan(
      [{ rule: 'committed-private-key', path: 'id_rsa', identity: 'file:id_rsa' }],
      undefined,
    );

    expect(fix.stays).toBe(
      'rotate the key, it stays in the git history, and load the new one from the environment or a secret store',
    );
    expect(
      plan([{ rule: 'committed-env-file', path: '.env', identity: 'file:.env' }], '')[0],
    ).not.toHaveProperty('stays');
  });
});
