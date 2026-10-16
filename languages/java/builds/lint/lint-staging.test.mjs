import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { blankSuppressions, stageSources } from './lint-staging.mjs';

const roots = [];

function temporary() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-lint-staging-'));
  roots.push(root);
  return root;
}

function writeFiles(root, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('blankSuppressions', () => {
  it('blanks every @SuppressWarnings, keeping its lines and columns', () => {
    const text = [
      '@SuppressWarnings("rawtypes") class A {',
      '  @java.lang.SuppressWarnings({',
      '      "unchecked"}) java.util.List names;',
      '}',
    ].join('\n');

    expect(blankSuppressions(text).split('\n')).toEqual([
      `${' '.repeat(29)} class A {`,
      ' '.repeat(31),
      `${' '.repeat(19)} java.util.List names;`,
      '}',
    ]);
  });
});

describe('stageSources', () => {
  it('copies the sources and every lombok.config on their way up to the analysis root', () => {
    const root = temporary();
    writeFiles(root, {
      'lombok.config': 'lombok.addLombokGeneratedAnnotation = true',
      'app/lombok.config': 'lombok.log.fieldName = LOG\n',
      'app/src/main/java/demo/lombok.config': 'lombok.accessors.fluent = true\n',
      'app/src/main/java/demo/A.java': 'package demo;\n@SuppressWarnings("all") class A {}\n',
      'app/src/main/java/other/B.java': 'package other;\nclass B {}\n',
      'app/src/test/lombok.config': 'lombok.accessors.chain = true\n',
    });
    const staged = path.join(root, 'app/build/nitpicker-lint/work/sources');
    const sources = ['app/src/main/java/demo/A.java', 'app/src/main/java/other/B.java'];

    const files = stageSources({
      root,
      sources: sources.map((file) => path.join(root, file)),
      staged,
    });

    expect(files).toEqual(sources.map((file) => path.join(staged, file)));
    expect(readFileSync(files[0], 'utf8')).toBe(`package demo;\n${' '.repeat(24)} class A {}\n`);
    expect(readFileSync(path.join(staged, 'lombok.config'), 'utf8')).toBe(
      'lombok.addLombokGeneratedAnnotation = true\nconfig.stopBubbling = true\n',
    );
    expect(readFileSync(path.join(staged, 'app/lombok.config'), 'utf8')).toBe(
      'lombok.log.fieldName = LOG\n',
    );
    expect(readFileSync(path.join(staged, 'app/src/main/java/demo/lombok.config'), 'utf8')).toBe(
      'lombok.accessors.fluent = true\n',
    );
    expect(existsSync(path.join(staged, 'app/src/test/lombok.config'))).toBe(false);
  });

  it('writes the configuration the root inherits from its parents, up to one that stops bubbling', () => {
    const outer = temporary();
    const root = path.join(outer, 'repo/app');
    writeFiles(outer, {
      'lombok.config': 'config.stopBubbling = true\nlombok.log.fieldName = LOG',
      'repo/lombok.config': 'lombok.accessors.fluent = true',
      'repo/app/lombok.config': 'lombok.accessors.chain = true',
      'repo/app/src/main/java/demo/A.java': 'package demo;\nclass A {}\n',
    });
    const staged = path.join(root, 'build/nitpicker-lint/work/sources');

    stageSources({ root, sources: [path.join(root, 'src/main/java/demo/A.java')], staged });

    expect(readFileSync(path.join(staged, 'lombok.config'), 'utf8')).toBe(
      [
        'config.stopBubbling = true',
        'lombok.log.fieldName = LOG',
        'lombok.accessors.fluent = true',
        'lombok.accessors.chain = true',
        'config.stopBubbling = true',
        '',
      ].join('\n'),
    );
  });

  it('stops the configuration lookup at the staged root when the project has no root lombok.config', () => {
    const root = temporary();
    writeFiles(root, { 'src/main/java/demo/A.java': 'package demo;\nclass A {}\n' });
    const staged = path.join(root, 'build/nitpicker-lint/work/sources');

    stageSources({ root, sources: [path.join(root, 'src/main/java/demo/A.java')], staged });

    expect(readFileSync(path.join(staged, 'lombok.config'), 'utf8')).toBe(
      'config.stopBubbling = true\n',
    );
  });
});
