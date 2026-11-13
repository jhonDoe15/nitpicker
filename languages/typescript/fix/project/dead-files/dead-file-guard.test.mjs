import { describe, expect, it } from 'vitest';
import { useFixtureProjects } from '../test-support/fixture-project.mjs';
import { guardDeletions } from './dead-file-guard.mjs';

const projects = useFixtureProjects();

function plannedDeletion(name) {
  return { name, edit: { type: 'delete', path: name }, deleted: true };
}

describe('guardDeletions', () => {
  it('keeps the deletion of a file that nothing can load', () => {
    const root = projects.create({
      'src/old.ts': 'export const a = 1;\n',
      'src/live.ts': 'export const b = 1;\n',
    });
    const planned = [plannedDeletion('src/old.ts')];
    expect(guardDeletions(root, planned)).toEqual({ planned, notes: [] });
  });

  it('drops the deletion when a computed import could load the file, and says why', () => {
    const root = projects.create({
      'src/plugins/old.ts': 'export const a = 1;\n',
      'src/load.ts': 'export const load = (name: string) => import("./plugins/" + name + ".js");\n',
    });
    const result = guardDeletions(root, [plannedDeletion('src/plugins/old.ts')]);
    expect(result.planned).toEqual([]);
    expect(result.notes).toEqual([
      '--fix kept src/plugins/old.ts, which knip reports unused: src/load.ts loads a module with a computed path',
    ]);
  });

  it('drops the deletion when a string names the file', () => {
    const root = projects.create({
      'src/old.ts': 'export const a = 1;\n',
      'test/mock.test.ts': "vi.mock('../src/old.js');\n",
    });
    expect(guardDeletions(root, [plannedDeletion('src/old.ts')]).notes[0]).toMatchInlineSnapshot(
      `"--fix kept src/old.ts, which knip reports unused: test/mock.test.ts names the module in a string"`,
    );
  });

  it('passes other edits through untouched', () => {
    const planned = [{ name: 'a.ts', edit: { type: 'write', path: 'a.ts', text: '' } }];
    expect(guardDeletions('/nowhere', planned)).toEqual({ planned, notes: [] });
  });
});
