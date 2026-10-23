import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
    const base = path.join(staged, 'tree');
    const sources = ['app/src/main/java/demo/A.java', 'app/src/main/java/other/B.java'];

    const { files, root: stagedRoot } = stageSources({
      root,
      sources: sources.map((file) => path.join(root, file)),
      staged,
    });

    expect(stagedRoot).toBe(base);
    expect(files).toEqual(sources.map((file) => path.join(base, file)));
    expect(readFileSync(files[0], 'utf8')).toBe(`package demo;\n${' '.repeat(24)} class A {}\n`);
    expect(readFileSync(path.join(staged, 'lombok.config'), 'utf8')).toBe(
      'config.stopBubbling = true\n',
    );
    expect(
      ['lombok.config', 'app/lombok.config', 'app/src/main/java/demo/lombok.config'].map((file) =>
        readFileSync(path.join(base, file), 'utf8'),
      ),
    ).toEqual([
      'lombok.addLombokGeneratedAnnotation = true',
      'lombok.log.fieldName = LOG\n',
      'lombok.accessors.fluent = true\n',
    ]);
    expect(existsSync(path.join(base, 'app/src/test/lombok.config'))).toBe(false);
  });

  it('copies the lombok.config of the parent folders up to the nearest one that stops bubbling', () => {
    const top = temporary();
    const outer = path.join(top, 'outer');
    const root = path.join(outer, 'repo/app');
    writeFiles(top, {
      'lombok.config': 'lombok.accessors.prefix += m_',
      'outer/lombok.config': 'config.stopBubbling = true\nlombok.log.fieldName = LOG',
      'outer/repo/lombok.config': 'lombok.accessors.fluent = true',
      'outer/repo/app/src/main/java/demo/A.java': 'package demo;\nclass A {}\n',
    });
    const staged = path.join(root, 'build/nitpicker-lint/work/sources');

    const tree = path.join(staged, 'tree');

    const staging = stageSources({
      root,
      sources: [path.join(root, 'src/main/java/demo/A.java')],
      staged,
    });

    expect(staging.root).toBe(path.join(tree, 'repo/app'));
    expect(readFileSync(path.join(tree, 'lombok.config'), 'utf8')).toBe(
      'config.stopBubbling = true\nlombok.log.fieldName = LOG',
    );
    expect(readFileSync(path.join(tree, 'repo/lombok.config'), 'utf8')).toBe(
      'lombok.accessors.fluent = true',
    );
    expect(
      readdirSync(staged, { recursive: true })
        .filter((file) => file.endsWith('lombok.config'))
        .sort(),
    ).toEqual(['lombok.config', 'tree/lombok.config', 'tree/repo/lombok.config']);
  });

  it('points relative imports of a copied lombok.config at the files they name', () => {
    const root = temporary();
    writeFiles(root, {
      'lombok.config': [
        'import ../shared/base.config',
        'import /etc/lombok/base.config',
        'import ~/lombok.config',
        'import <HOME>/lombok.config',
        'import config/models.jar!lombok/models.config',
        'lombok.accessors.chain = true',
        '',
      ].join('\n'),
      'src/main/java/demo/A.java': 'package demo;\nclass A {}\n',
    });
    const staged = path.join(root, 'build/nitpicker-lint/work/sources');

    const staging = stageSources({
      root,
      sources: [path.join(root, 'src/main/java/demo/A.java')],
      staged,
    });

    expect(readFileSync(path.join(staging.root, 'lombok.config'), 'utf8')).toBe(
      [
        `import ${path.join(path.dirname(root), 'shared/base.config')}`,
        'import /etc/lombok/base.config',
        'import ~/lombok.config',
        'import <HOME>/lombok.config',
        `import ${path.join(root, 'config/models.jar')}!lombok/models.config`,
        'lombok.accessors.chain = true',
        '',
      ].join('\n'),
    );
  });
});
