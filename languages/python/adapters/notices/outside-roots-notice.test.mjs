import { describe, expect, it } from 'vitest';
import { pythonOutsideRootsNotices } from './outside-roots-notice.mjs';

const project = {
  projectRoot: '/missing',
  sourceRoots: ['src'],
  isTestFile: (file) => file.startsWith('tests/') || file.endsWith('_test.py'),
};

describe('pythonOutsideRootsNotices', () => {
  it('names changed Python files outside the source roots', () => {
    const notice = pythonOutsideRootsNotices(['src/app/a.py', 'tools/b.py', 'lib/c.pyi'], project);

    expect(notice).toHaveLength(1);
    expect(notice[0]).toContain('2 changed Python files are outside python.sourceRoots');
    expect(notice[0]).toContain('lib/c.pyi, tools/b.py.');
  });

  it('takes the project as the root when the source root is .', () => {
    expect(pythonOutsideRootsNotices(['tools/b.py'], { ...project, sourceRoots: ['.'] })).toEqual(
      [],
    );
  });

  it('stays quiet for tests, tool files, documentation, installed and hidden folders, exclusions and generated code', () => {
    const files = [
      'tests/test_a.py',
      'scripts/x_test.py',
      'conftest.py',
      'setup.py',
      'noxfile.py',
      'docs/conf.py',
      'examples/demo.py',
      'venv/lib/x.py',
      'build/lib/x.py',
      '.tox/x.py',
      'vendor/y.py',
      'api/schema_pb2.py',
      'README.md',
    ];

    expect(pythonOutsideRootsNotices(files, { ...project, exclude: ['vendor/**'] })).toEqual([]);
  });
});
