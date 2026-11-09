import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { newerToolchain, sourceHash } from './go-tools.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-go-tools-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(relative, text) {
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  writeFileSync(path.join(root, relative), text);
}

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

describe('the hash that names a built program', () => {
  it('changes with a source file in a subpackage, not with tests or fixtures', () => {
    write('main.go', 'package main\n');
    write('rules/rule.go', 'package rules\n');
    const before = sourceHash(root, '');
    write('rules/rule_test.go', 'package rules\n');
    write('fixtures/sample.go', 'package sample\n');
    expect(sourceHash(root, '')).toBe(before);
    write('rules/rule.go', 'package rules\n\nconst Name = "changed"\n');
    expect(sourceHash(root, '')).not.toBe(before);
  });
});
