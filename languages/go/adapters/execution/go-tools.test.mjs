import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { newerToolchain, sourceHash } from './go-tools.mjs';

describe('the toolchain the lint program builds with', () => {
  it.each([
    ['go1.26.3', undefined],
    ['go1.27.0', undefined],
    ['go1.27rc1', undefined],
    ['go1.28', 'go1.28'],
    ['go1.28.0', 'go1.28.0'],
    ['go1.28rc1', 'go1.28rc1'],
    ['go1.28.0 X:nocoverageredesign', 'go1.28.0'],
    ['go2.0.1', 'go2.0.1'],
    ['devel go1.29-0123abcd Mon Jan 1 00:00:00 2027 +0000', undefined],
    ['', undefined],
  ])('reads %j as %j', (version, toolchain) => {
    expect(newerToolchain(version)).toBe(toolchain);
  });
});

describe('the cache key of a Go program', () => {
  const roots = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function program() {
    const root = mkdtempSync(path.join(tmpdir(), 'go-source-'));
    roots.push(root);
    for (const [name, text] of [
      ['main.go', 'package main\n'],
      ['catalog/catalog.go', 'package catalog\n'],
      ['fixtures/a/a.go', 'package a\n'],
      ['main_test.go', 'package main\n'],
    ]) {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      writeFileSync(path.join(root, name), text);
    }
    return root;
  }

  it('changes with a source file in a subfolder', () => {
    const root = program();
    const before = sourceHash(root, '');
    writeFileSync(path.join(root, 'catalog/catalog.go'), 'package catalog\n\nvar changed = 1\n');
    expect(sourceHash(root, '')).not.toBe(before);
  });

  it('ignores fixtures and Go tests', () => {
    const root = program();
    const before = sourceHash(root, '');
    writeFileSync(path.join(root, 'fixtures/a/a.go'), 'package a\n\nvar changed = 1\n');
    writeFileSync(path.join(root, 'main_test.go'), 'package main\n\nvar changed = 1\n');
    expect(sourceHash(root, '')).toBe(before);
  });
});
