import { describe, expect, it } from 'vitest';
import { noticeDescriber } from './notices.mjs';
import { outsideRootsNotices } from '../../../languages/typescript/preset/notices/outside-roots-notice.mjs';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';

const { createGitRepository } = useGitFixtures();
const changed = ['scripts/slop.ts', 'src/a.ts'];

describe('noticeDescriber', () => {
  it('describes changed TypeScript files outside the roots for the TypeScript preset', () => {
    const expected = outsideRootsNotices(changed, {});

    expect(expected).toHaveLength(1);
    expect(noticeDescriber({}, {})?.(changed)).toEqual(expected);
    expect(noticeDescriber({ preset: 'typescript' }, {})?.(changed)).toEqual(expected);
  });

  it('uses the head policy of the project', () => {
    const describeExcluded = noticeDescriber({}, { exclude: ['scripts/**'] });

    expect(describeExcluded?.(changed)).toEqual([]);
  });

  it('describes changed Python files outside python.sourceRoots', () => {
    const { root } = createGitRepository({
      'src/app/__init__.py': '',
      'tools/slop.py': 'x = 1\n',
    });
    const describe = noticeDescriber({ preset: 'python' }, { exclude: [] }, root);

    expect(describe?.(['src/app/__init__.py', 'tools/slop.py', 'tests/test_a.py'])).toEqual([
      '1 changed Python file is outside python.sourceRoots, so only the lint and format checks see it: tools/slop.py. ' +
        'Move it under a source root or add its folder to python.sourceRoots; to leave it unchecked, list it in "exclude" in nitpicker.config.json.',
    ]);
  });

  it('describes changed Java and Kotlin files outside the build source sets, following declared directories', () => {
    const { root } = createGitRepository({
      'build.gradle': "sourceSets { main { java { srcDir 'extra/code' } } }\n",
      'src/main/java/A.java': 'class A {}\n',
    });
    const files = ['src/main/java/A.java', 'extra/code/B.java', 'tools/Slop.java', 'tools/Slop.kt'];

    expect(noticeDescriber({ preset: 'java' }, { exclude: [] }, root)?.(files)).toEqual([
      "1 changed Java file is outside the build's source sets, so the build does not compile or check it: tools/Slop.java. " +
        'Move it under src/main or src/test of a module, or declare its folder as a source directory in the build file; to leave it unchecked, list it in "exclude" in nitpicker.config.json.',
    ]);
    expect(noticeDescriber({ preset: 'kotlin' }, { exclude: ['tools/**'] }, root)?.(files)).toEqual(
      [],
    );
    expect(noticeDescriber({ preset: 'kotlin' }, { exclude: [] }, root)?.(files)).toHaveLength(1);
  });

  it('describes nothing for the javascript preset', () => {
    expect(noticeDescriber({ preset: 'javascript' }, {})).toBeUndefined();
  });
});
