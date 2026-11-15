import { describe, expect, it } from 'vitest';
import { filesEnvironment } from '../../test-support/env.mjs';
import { projectEnvironment } from '../../environment.mjs';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findTestFile } from './index.mjs';
import { withProjectIndex } from './project-tests.mjs';

const find = (file, files) => findTestFile(file, filesEnvironment(files));

describe('TypeScript lookup', () => {
  it('ignores imports in comments and in other strings', () => {
    const files = {
      'src/a.ts': 'export const a = 1;',
      'test/x.test.ts':
        "// import { a } from '../src/a';\n/* import '../src/a' */\nconst s = \"x\";\n",
    };

    expect(find('src/a.ts', files).exists).toBe(false);
  });

  it('does not report the test of a consumer that only imports the module', () => {
    const files = {
      'src/util.ts': 'export const util = 1;',
      'src/a.ts': "import { util } from './util';",
      'test/a.test.ts': "import '../src/a';",
    };

    expect(find('src/util.ts', files)).toEqual({ path: 'test/util.test.ts', exists: false });
  });

  it('accepts a barrel only when the test imports a name the target exports', () => {
    const files = {
      'src/p/a.ts': 'export function used() {}',
      'src/p/index.ts': "export * from './a';\nexport * from './b';",
      'src/p/b.ts': 'export function other() {}',
      'test/b.test.ts': "import { other } from '../src/p';",
      'test/a.test.ts': "import { used } from '../src/p';",
    };

    expect(find('src/p/a.ts', files).path).toBe('test/a.test.ts');
  });

  it('does not take an existing flat test of another module with the same name', () => {
    const files = {
      'src/a/utils.ts': 'export const u = 1;',
      'src/b/utils.ts': 'export const v = 1;',
      'test/utils.test.ts': "import { u } from '../src/a/utils';",
    };

    expect(find('src/b/utils.ts', files)).toEqual({ path: 'test/b/utils.test.ts', exists: false });
    expect(find('src/a/utils.ts', files)).toEqual({ path: 'test/utils.test.ts', exists: true });
  });

  it('maps a top-level file under src to the test folder itself', () => {
    const files = { 'src/index.ts': '', 'test/deep/x.test.ts': '', 'test/y.test.ts': '' };

    expect(find('src/index.ts', files).path).toBe('test/index.test.ts');
  });
});

describe('JVM lookup', () => {
  const order = {
    'src/main/java/p/Order.java': 'package p;\npublic class Order {}',
    'src/test/java/p/Mentions.java': '',
    'src/test/java/p/A1Test.java': 'package p;\n// Order is described here\nclass A1Test {}',
    'src/test/java/p/MockTest.java': 'package p;\nclass MockTest { String s = "Order"; }',
    'src/test/java/q/UsesTest.java':
      'package q;\nimport p.Order;\nclass UsesTest { void t() { new Order(); } }',
  };

  it('ignores a class name in comments and strings and finds a real user', () => {
    expect(find('src/main/java/p/Order.java', order).path).toBe('src/test/java/q/UsesTest.java');
  });

  it('prefers a test named for the class', () => {
    const files = { ...order, 'src/test/java/z/OrderTests.java': 'package z;' };

    expect(find('src/main/java/p/Order.java', files).path).toBe('src/test/java/z/OrderTests.java');
  });

  it('accepts a same-package test that uses the class', () => {
    const files = {
      'src/main/java/p/Order.java': 'package p;',
      'src/test/java/p/FlowTest.java':
        'package p;\nclass FlowTest { Order o = null; void t() { Order.make(); } }',
    };

    expect(find('src/main/java/p/Order.java', files).path).toBe('src/test/java/p/FlowTest.java');
  });
});

describe('Python lookup', () => {
  it('does not match a standard-library import of the same leaf name', () => {
    const files = { 'src/app/json.py': '', 'tests/test_x.py': 'import json\n' };

    expect(find('src/app/json.py', files).exists).toBe(false);
  });

  it('matches a package-qualified import', () => {
    const files = { 'src/app/json.py': '', 'tests/test_x.py': 'from app.json import dumps\n' };

    expect(find('src/app/json.py', files)).toEqual({ path: 'tests/test_x.py', exists: true });
  });
});

describe('lookup cost', () => {
  it('reads each file once however many lookups run', () => {
    const reads = new Map();
    const base = filesEnvironment({
      ...Object.fromEntries(
        Array.from({ length: 300 }, (_, i) => [`src/m${i}.ts`, `import './m${(i + 1) % 300}';`]),
      ),
      ...Object.fromEntries(
        Array.from({ length: 300 }, (_, i) => [`test/m${i}.test.ts`, `import '../src/m${i}';`]),
      ),
      'src/orphan.ts': 'export const o = 1;',
    });
    const env = {
      ...base,
      read: (name) => {
        reads.set(name, (reads.get(name) ?? 0) + 1);
        return base.read(name);
      },
    };
    const indexed = withProjectIndex(env);
    Array.from({ length: 20 }, () => findTestFile('src/orphan.ts', indexed));

    expect(Math.max(...reads.values())).toBe(1);
  });
});

describe('projectEnvironment files', () => {
  it('skips build folders only at the root, lists shallow files first and sorts by code unit', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-env-'));
    try {
      for (const folder of ['build', 'src/build', 'node_modules/x', 'test']) {
        mkdirSync(path.join(root, folder), { recursive: true });
      }
      for (const file of [
        'build/a.js',
        'src/build/b.ts',
        'node_modules/x/c.js',
        'test/t.test.ts',
        'B.ts',
        'a.ts',
      ]) {
        writeFileSync(path.join(root, file), '');
      }

      expect(projectEnvironment(root).files()).toEqual([
        'B.ts',
        'a.ts',
        'test/t.test.ts',
        'src/build/b.ts',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('puts a new test in the feature test folder before a layer folder of the same name', () => {
    const files = {
      'src/features/pricing/domain/rates.ts': 'export const rate = 1;',
      'test/domain/money.test.ts': '',
      'test/pricing/pricing.test.ts': '',
    };

    expect(find('src/features/pricing/domain/rates.ts', files)).toEqual({
      path: 'test/pricing/rates.test.ts',
      exists: false,
    });
  });
});
