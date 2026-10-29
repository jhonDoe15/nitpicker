import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EDITED_LINE_SENTENCE } from '../../../../../core/diff/comparison/positions/touched-lines.mjs';
import {
  commitBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  kotlinSources,
  removeProject,
  writeAll,
  git,
} from '../test-support/kotlin-e2e-project.mjs';

const kotlinClass = (name, ...members) =>
  `package demo\n\nclass ${name} {\n${members.join('\n\n')}\n}\n`;
const SPREAD = [
  '        var total = left + right',
  '        total = total * 2',
  '        total = total + left',
  '        total = total - right',
  '        total = total / 3',
  '        return total',
];
const PICK = [
  '    fun pick(left: Int, right: Int): Int {',
  '        if (left > right + 5) {',
  '            return left',
  '        }',
];
const isThree = (name, condition = 'if (value == 3) {') =>
  [
    `    fun ${name}(value: Int): Boolean {`,
    `        ${condition}`,
    '            return true',
    '        }',
    '        return false',
    '    }',
  ].join('\n');
const clamp = (condition) =>
  [
    '    fun clamp(value: Int): Int {',
    `        ${condition}`,
    '            return 10',
    '        }',
    '        return value',
    '    }',
  ].join('\n');

const BASE = {
  [`${kotlinSources}/Picker.kt`]: kotlinClass('Picker', [...PICK, ...SPREAD, '    }'].join('\n')),
  [`${kotlinSources}/Messy.kt`]: kotlinClass('Messy', clamp('if(value>10){')),
  [`${kotlinSources}/Twice.kt`]: kotlinClass('Twice', isThree('first'), isThree('second')),
  [`${kotlinSources}/Edited.kt`]: kotlinClass('Edited', isThree('check')),
};

const HEAD = {
  [`${kotlinSources}/Picker.kt`]: kotlinClass(
    'Picker',
    ['    private fun spread(left: Int, right: Int): Int {', ...SPREAD, '    }'].join('\n'),
    [...PICK, '        return spread(left, right)', '    }'].join('\n'),
  ),
  [`${kotlinSources}/Messy.kt`]: kotlinClass('Messy', clamp('if (value > 10) {')),
  [`${kotlinSources}/Twice.kt`]: kotlinClass(
    'Twice',
    isThree('first'),
    isThree('middle'),
    isThree('second'),
  ),
  [`${kotlinSources}/Edited.kt`]: kotlinClass(
    'Edited',
    isThree('check', 'if (value == 3) { // three is the only special value'),
  ),
};

describe.skipIf(!kotlinE2eEnabled)(
  'Kotlin changed-branch coverage on lines a change did not really edit',
  () => {
    let project;
    let result;

    beforeAll(() => {
      project = initializeProject();
      writeAll(project, BASE);
      git(project, 'add', '-A');
      git(project, 'commit', '-q', '-m', 'legacy uncovered branches');
      commitBranch(project, 'touches', HEAD);
      result = diffOf(project, 'touches');
    });

    afterAll(() => {
      removeProject(project);
    });

    const newBranches = () =>
      result.newFindings
        .filter(({ rule }) => rule === 'changed-branch-coverage')
        .map(({ path: file, location }) => `${path.basename(file)}:${String(location.line)}`);

    it('keeps a legacy branch baselined above an extracted helper and through reformatting', () => {
      expect(
        newBranches().filter((entry) => !entry.startsWith('Twice') && !entry.startsWith('Edited')),
      ).toEqual([]);
    });

    it('reports a repeated branch on the added function, not on a legacy one', () => {
      expect(newBranches().filter((entry) => entry.startsWith('Twice'))).toEqual(['Twice.kt:12']);
    });

    it('keeps magic numbers baselined through a move and a reformat, and finds the added one', () => {
      expect(
        result.newFindings
          .filter(({ rule }) => rule === 'detekt.style.MagicNumber')
          .map(({ path: file, location }) => `${path.basename(file)}:${String(location.line)}`),
      ).toEqual(['Twice.kt:12']);
    });

    it('says a legacy branch is new because the change edited its line', () => {
      const [edited, ...rest] = result.newFindings.filter(
        ({ rule, path: file }) =>
          rule === 'changed-branch-coverage' && path.basename(file) === 'Edited.kt',
      );

      expect(rest).toEqual([]);
      expect(edited.location.line).toBe(5);
      expect(edited.message).toContain(EDITED_LINE_SENTENCE);
    });
  },
);
