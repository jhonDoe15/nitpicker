import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EDITED_LINE_SENTENCE } from '../../../../../core/diff/comparison/positions/touched-lines.mjs';
import {
  commitBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  removeProject,
  writeAll,
  git,
} from '../__tests__/kotlin-e2e-project.mts';
import type { DiffResult, KotlinProject } from '../__tests__/kotlin-e2e-project.mts';
import { TOUCHED_BASE, TOUCHED_HEAD } from './__tests__/kotlin-touched-lines-sources.mts';

describe.skipIf(!kotlinE2eEnabled)(
  'Kotlin changed-branch coverage on lines a change did not really edit',
  () => {
    let project: KotlinProject;
    let result: DiffResult;

    beforeAll(() => {
      project = initializeProject();
      writeAll(project, TOUCHED_BASE);
      git(project, 'add', '-A');
      git(project, 'commit', '-q', '-m', 'legacy uncovered branches');
      commitBranch(project, 'touches', TOUCHED_HEAD);
      result = diffOf(project, 'touches');
    });

    afterAll(() => {
      removeProject(project);
    });

    function newLocations(rule: string): string[] {
      return result.newFindings
        .filter((finding) => finding.rule === rule)
        .map(({ path: file, location }) => `${path.basename(file)}:${String(location?.line)}`);
    }

    it.each([
      {
        title: 'keeps a legacy branch baselined above an extracted helper and through reformatting',
        rule: 'changed-branch-coverage',
        keep: (entry: string) => !(entry.startsWith('Twice') || entry.startsWith('Edited')),
        expected: [],
      },
      {
        title: 'reports a repeated branch on the added function, not on a legacy one',
        rule: 'changed-branch-coverage',
        keep: (entry: string) => entry.startsWith('Twice'),
        expected: ['Twice.kt:12'],
      },
      {
        title:
          'keeps magic numbers baselined through a move and a reformat, and finds the added one',
        rule: 'detekt.style.MagicNumber',
        keep: () => true,
        expected: ['Twice.kt:12'],
      },
    ])('$title', ({ rule, keep, expected }) => {
      expect(newLocations(rule).filter(keep)).toEqual(expected);
    });

    it('says a legacy branch is new because the change edited its line', () => {
      const [edited, ...rest] = result.newFindings.filter(
        ({ rule, path: file }) =>
          rule === 'changed-branch-coverage' && path.basename(file) === 'Edited.kt',
      );

      expect(rest).toEqual([]);
      expect(edited?.location?.line).toBe(5);
      expect(edited?.message).toContain(EDITED_LINE_SENTENCE);
    });
  },
);
