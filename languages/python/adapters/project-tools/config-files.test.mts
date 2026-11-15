import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { textsOf } from '../../../../shared/values/readers.mts';
import { pythonConfigFiles } from './config-files.mts';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mts';

const { temporaryRoot } = useGitFixtures();

describe('the Python config files that key the findings cache', () => {
  it('include the pytest config, whose retry values the test run reads', () => {
    const root = temporaryRoot('nitpicker-python-config-');
    for (const name of ['pytest.ini', 'tox.ini', 'unrelated.ini']) {
      writeFileSync(path.join(root, name), '[pytest]\nreruns = 2\n');
    }

    expect(textsOf(pythonConfigFiles(root)).map((file) => path.basename(file))).toEqual([
      'pytest.ini',
      'tox.ini',
    ]);
  });
});
