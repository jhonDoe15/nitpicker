import { describe, expect, it } from 'vitest';
import { filesEnvironment } from '../../test-support/env.mjs';
import { findTestFile } from './index.mjs';

const find = (file, files) => findTestFile(file, filesEnvironment(files));

describe('findTestFile for TypeScript and JavaScript', () => {
  it('prefers a test beside the source that exists', () => {
    expect(
      find('src/a.ts', { 'src/a.test.ts': '', 'test/x.test.ts': "import '../src/a';" }),
    ).toEqual({
      path: 'src/a.test.ts',
      exists: true,
    });
  });

  it('finds a test that imports the module', () => {
    const files = { 'src/a.ts': '', 'test/all.test.ts': "import { f } from '../src/a.js';\n" };

    expect(find('src/a.ts', files)).toEqual({ path: 'test/all.test.ts', exists: true });
  });

  it('finds a test that imports a module re-exporting the target', () => {
    const files = {
      'src/feature/adapters/print.ts': 'export function run() {}',
      'src/feature/adapters/index.ts': "export * from './print';\n",
      'src/feature/index.ts': "export { run } from './adapters';\n",
      'test/feature.test.ts': "import { run } from '../src/feature';\n",
      'test/other.test.ts': "import { x } from '../src/other';\n",
    };

    expect(find('src/feature/adapters/print.ts', files)).toEqual({
      path: 'test/feature.test.ts',
      exists: true,
    });
  });

  it('prefers a test that imports the target itself over one that uses a re-export', () => {
    const files = {
      'src/p/a.ts': '',
      'src/p/index.ts': "export * from './a';\n",
      'test/a.test.ts': "import '../src/p/index';\n",
      'test/z.test.ts': "import '../src/p/a';\n",
    };

    expect(find('src/p/a.ts', files)?.path).toBe('test/z.test.ts');
  });

  it.each([
    [
      'suggests a path in the top-level test folder when the project keeps its tests there',
      'src/deep/b.ts',
      { 'src/a.ts': '', 'test/a.test.ts': "import '../src/a';\n", 'test/c.test.ts': '' },
      { path: 'test/b.test.ts', exists: false },
    ],
    [
      'reports a suggested path that exists',
      'src/b.ts',
      { 'test/b.test.ts': '', 'test/c.test.ts': '' },
      { path: 'test/b.test.ts', exists: true },
    ],
    [
      'mirrors the folders when the tests in the test folder are nested',
      'src/deep/b.ts',
      { 'test/deep/c.spec.ts': '', 'test/d.spec.ts': '' },
      { path: 'test/deep/b.spec.ts', exists: false },
    ],
  ])('%s', (_name, file, files, expected) => {
    expect(find(file, files)).toEqual(expected);
  });

  it('suggests the place beside the source when the project keeps tests there or has none', () => {
    expect(find('src/a.ts', { 'src/b.test.ts': '' }).path).toBe('src/a.test.ts');
    expect(find('src/a.ts', {}).path).toBe('src/a.test.ts');
  });
});

describe('findTestFile for the other presets', () => {
  it('finds a Python test that imports the module and suggests tests/ otherwise', () => {
    const files = { 'pkg/a.py': '', 'tests/test_all.py': 'from pkg.a import f\n' };

    expect(find('pkg/a.py', files)).toEqual({ path: 'tests/test_all.py', exists: true });
    expect(find('pkg/b.py', files)).toEqual({ path: 'tests/test_b.py', exists: false });
  });

  it('finds a Java or Kotlin test that mentions the class and mirrors the source set otherwise', () => {
    const files = {
      'src/main/java/p/Order.java': '',
      'src/test/java/p/CheckoutFlowTest.java': 'new Order();',
    };

    expect(find('src/main/java/p/Order.java', files).path).toBe(
      'src/test/java/p/CheckoutFlowTest.java',
    );
    expect(find('src/main/java/p/Other.java', files)).toEqual({
      path: 'src/test/java/p/OtherTest.java',
      exists: false,
    });
  });

  it('uses another test file of the Go package', () => {
    expect(find('pkg/a.go', { 'pkg/x_test.go': '' })).toEqual({
      path: 'pkg/x_test.go',
      exists: true,
    });
    expect(find('pkg/a.go', {}).path).toBe('pkg/a_test.go');
  });
});
