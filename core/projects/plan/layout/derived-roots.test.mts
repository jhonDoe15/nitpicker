import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { derivedSourceRoots } from './derived-roots.mts';

const roots: string[] = [];

function packageWith(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-derived-roots-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const CODE = 'export {};\n';

describe('derived source roots', () => {
  it('keeps the default when the package has a src folder', () => {
    expect(derivedSourceRoots(packageWith({ 'src/a.ts': CODE, 'index.ts': CODE }))).toBeUndefined();
  });

  it('takes the folders that tsconfig.json includes, leaving out paths outside the package', () => {
    const tsconfig = '{ // comment\n "include": ["views/**/*", "utils", "../shared/**/*"] }';
    const found = packageWith({
      'tsconfig.json': tsconfig,
      'views/a.tsx': CODE,
      'utils/b.ts': CODE,
    });
    expect(derivedSourceRoots(found)).toEqual(['utils', 'views']);
  });

  it('reads a root glob in tsconfig.json as the package root', () => {
    const found = packageWith({ 'tsconfig.json': '{"include":["**/*.ts"]}', 'a.ts': CODE });
    expect(derivedSourceRoots(found)).toEqual(['.']);
  });

  it('falls back to the package.json entry folder and skips the build output', () => {
    const manifest =
      '{"main":"dist/index.js","exports":{".":"./lib/index.js","./package.json":"./package.json"}}';
    const found = packageWith({ 'package.json': manifest, 'lib/index.js': CODE });
    expect(derivedSourceRoots(found)).toEqual(['lib']);
  });

  it('skips the tsconfig.json output folder and uses the package root', () => {
    const found = packageWith({
      'tsconfig.json': '{"compilerOptions":{"outDir":"./lib"},"include":["../elsewhere/**/*"]}',
      'package.json': '{"exports":{".":"./lib/index.js"}}',
      'index.js': CODE,
    });
    expect(derivedSourceRoots(found)).toEqual(['.']);
  });

  it('leaves test folders out of the source roots', () => {
    const found = packageWith({
      'tsconfig.json': '{"include":["src","test"]}',
      'test/a.test.ts': CODE,
    });
    expect(derivedSourceRoots(found)).toEqual(['.']);
  });

  it('expands braces in tsconfig.json includes', () => {
    const found = packageWith({
      'tsconfig.json': '{"include":["{app,lib}/**/*"]}',
      'app/a.ts': CODE,
      'lib/b.ts': CODE,
    });
    expect(derivedSourceRoots(found)).toEqual(['app', 'lib']);
  });

  it('takes a package.json entry without an extension', () => {
    const found = packageWith({ 'package.json': '{"main":"lib/index"}', 'lib/index.js': CODE });
    expect(derivedSourceRoots(found)).toEqual(['lib']);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'skips a folder it cannot read',
    () => {
      const found = packageWith({ 'package.json': '{}', 'locked/a.ts': CODE, 'open/b.ts': CODE });
      chmodSync(path.join(found, 'locked'), 0o000);
      try {
        expect(derivedSourceRoots(found)).toEqual(['.']);
      } finally {
        chmodSync(path.join(found, 'locked'), 0o755);
      }
    },
  );

  it('derives nothing for a package without code outside its tool configuration', () => {
    const found = packageWith({
      'package.json': '{}',
      'vitest.config.ts': CODE,
      'types.d.ts': CODE,
    });
    expect(derivedSourceRoots(found)).toBeUndefined();
  });
});
