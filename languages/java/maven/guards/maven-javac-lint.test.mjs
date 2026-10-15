import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { zipOf } from '../../builds/test-support/zip-writer.mjs';
import { isJavaModule, languageLevel, lintCompatible, runJavacLint } from './maven-javac-lint.mjs';

const roots = [];
const NO_SETTINGS = { release: undefined, source: undefined, target: undefined, args: [] };

function temporary() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-javac-lint-'));
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

describe('lintCompatible', () => {
  it('drops the options that would change what the lint pass reports or where it writes', () => {
    expect(
      lintCompatible([
        '-parameters',
        '-Werror',
        '-Xlint:all',
        '-Xdoclint:none',
        '-proc:full',
        '-implicit:class',
        '-Xplugin:ErrorProne',
        '-processorpath',
        '/p.jar',
        '-encoding',
        'ISO-8859-1',
        '-d',
        '/out',
        '--enable-preview',
        '-Xmaxwarns',
        '5',
      ]),
    ).toEqual(['-parameters', '--enable-preview']);
  });
});

describe('languageLevel', () => {
  it.each([
    ['the release', { ...NO_SETTINGS, release: '17', source: '11' }, ['--release', '17']],
    ['nothing when the arguments give a release', { ...NO_SETTINGS, args: ['--release=21'] }, []],
    ['source and target', { ...NO_SETTINGS, source: '1.8', target: '1.8' }, ['-source', '1.8', '-target', '1.8']],
    ['what the arguments leave out', { ...NO_SETTINGS, source: '11', target: '11', args: ['-source', '11'] }, ['-target', '11']],
    ['nothing when the POM sets no level', NO_SETTINGS, []],
  ])('passes %s', (_, compiler, expected) => {
    expect(languageLevel(compiler)).toEqual(expected);
  });
});

describe('isJavaModule', () => {
  it('recognizes explicit, automatic and multi-release modules, in jars and directories', () => {
    const root = temporary();
    const jars = {
      'explicit.jar': { 'module-info.class': '' },
      'automatic.jar': { 'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\nAutomatic-Module-Name: demo.auto\n' },
      'versioned.jar': { 'META-INF/versions/11/module-info.class': '' },
      'plain.jar': { 'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\n', 'demo/A.class': '' },
    };
    for (const [name, entries] of Object.entries(jars)) {
      writeFileSync(path.join(root, name), zipOf(entries));
    }
    writeFiles(root, { 'classes/module-info.class': '', 'plain-classes/demo/A.class': '', 'notes.txt': '' });

    expect(
      [...Object.keys(jars), 'classes', 'plain-classes', 'notes.txt'].filter((name) =>
        isJavaModule(path.join(root, name)),
      ),
    ).toEqual(['explicit.jar', 'automatic.jar', 'versioned.jar', 'classes']);
  });
});

describe('runJavacLint', () => {
  const warning = (file, line) => `${file}:${String(line)}: warning: [rawtypes] found raw type: List`;

  it('keeps the base warnings of files unchanged since the base without compiling them', () => {
    const base = temporary();
    const head = temporary();
    const sources = { 'src/main/java/demo/A.java': 'class A {}', 'src/main/java/demo/B.java': 'class B {}' };
    writeFiles(base, sources);
    writeFiles(head, sources);
    writeFiles(base, {
      'target/nitpicker/javac-lint.txt': [
        warning('src/main/java/demo/A.java', 3),
        '  List all();',
        warning('src/main/java/demo/Gone.java', 1),
        '1 warning',
        '',
      ].join('\n'),
    });
    const reportDir = path.join(head, 'target/nitpicker');
    writeFiles(head, { 'target/nitpicker/javac-lint-failed.txt': 'old failure' });
    const module = {
      basedir: head,
      sourceRoots: [path.join(head, 'src/main/java')],
      outputDirectory: path.join(head, 'target/classes'),
      compiler: NO_SETTINGS,
    };

    runJavacLint({ module, reportDir, classpaths: { mainCompile: [] }, baselineDir: base });

    expect(readFileSync(path.join(reportDir, 'javac-lint.txt'), 'utf8')).toBe(
      `${warning('src/main/java/demo/A.java', 3)}\n`,
    );
    expect(existsSync(path.join(reportDir, 'javac-lint-failed.txt'))).toBe(false);
  });
});
