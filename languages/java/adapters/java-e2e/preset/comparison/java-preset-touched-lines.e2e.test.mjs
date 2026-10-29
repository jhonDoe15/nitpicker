import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runJavaDiff } from '../../../java-diff.mjs';
import { commitBranch, runGitIn } from '../../../test-support/gradle-e2e.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const sources = 'src/main/java/demo';

const javaClass = (name, ...members) =>
  `package demo;\n\npublic final class ${name} {\n${members.join('\n\n')}\n}\n`;
const SPREAD = [
  '    int total = left + right;',
  '    total = total * 2;',
  '    total = total + left;',
  '    total = total - right;',
  '    total = total / 3;',
  '    return total;',
];
const PICK = [
  '  public int pick(int left, int right) {',
  '    if (left > right) {',
  '      return left;',
  '    }',
];
const isThree = (name) =>
  [
    `  public boolean ${name}(int value) {`,
    '    if (value == 3) {',
    '      return true;',
    '    }',
    '    return false;',
    '  }',
  ].join('\n');
const CLAMP = (condition) =>
  [
    '  public int clamp(int value) {',
    `    ${condition}`,
    '      return 10;',
    '    }',
    '    return value;',
    '  }',
  ].join('\n');

const BASE = {
  [`${sources}/Picker.java`]: javaClass('Picker', [...PICK, ...SPREAD, '  }'].join('\n')),
  [`${sources}/Messy.java`]: javaClass('Messy', CLAMP('if(value>10){')),
  [`${sources}/Twice.java`]: javaClass('Twice', isThree('first'), isThree('second')),
};

const HEAD = {
  [`${sources}/Picker.java`]: javaClass(
    'Picker',
    ['  private static int spread(int left, int right) {', ...SPREAD, '  }'].join('\n'),
    [...PICK, '    return spread(left, right);', '  }'].join('\n'),
  ),
  [`${sources}/Messy.java`]: javaClass('Messy', CLAMP('if (value > 10) {')),
  [`${sources}/Twice.java`]: javaClass(
    'Twice',
    isThree('first'),
    isThree('middle'),
    isThree('second'),
  ),
};

describe.skipIf(!enabled)(
  'Java changed-branch coverage on lines a change did not really edit',
  () => {
    let repository;
    let result;

    beforeAll(() => {
      repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-touched-'));
      cpSync(path.resolve(import.meta.dirname, '../../../fixtures/gradle-project'), repository, {
        recursive: true,
      });
      writeFileSync(path.join(repository, '.gitignore'), 'build/\n.gradle/\n');
      for (const [file, text] of Object.entries(BASE)) {
        writeFileSync(path.join(repository, file), text);
      }
      runGitIn(repository, 'init', '-q', '-b', 'main');
      runGitIn(repository, 'add', '-A');
      runGitIn(repository, 'commit', '-q', '-m', 'legacy uncovered branches');
      commitBranch(repository, 'touches', HEAD);
      result = runJavaDiff({ repositoryRoot: repository, requestedBaseRef: 'main', gradle });
    }, 180_000);

    afterAll(() => {
      rmSync(repository, { recursive: true, force: true });
    });

    const newBranches = () =>
      result.newFindings
        .filter(({ rule }) => rule === 'changed-branch-coverage')
        .map(({ path: file, location }) => `${path.basename(file)}:${String(location.line)}`);

    it('keeps a legacy branch baselined above an extracted helper and through reformatting', () => {
      expect(newBranches().filter((entry) => !entry.startsWith('Twice'))).toEqual([]);
    });

    it('reports a repeated branch on the added method, not on a legacy one', () => {
      expect(newBranches().filter((entry) => entry.startsWith('Twice'))).toEqual(['Twice.java:12']);
    });
  },
);
