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
        '-J-Xmx2g',
        '-cp',
        '/lib.jar',
        '--class-path=/lib.jar',
        '-sourcepath',
        '/src',
        '--module-path=/mods',
      ]),
    ).toEqual(['-parameters', '--enable-preview']);
  });
});

describe('languageLevel', () => {
  it.each([
    ['the release', { ...NO_SETTINGS, release: '17', source: '11' }, ['--release', '17']],
    ['nothing when the arguments give a release', { ...NO_SETTINGS, args: ['--release=21'] }, []],
    [
      'source and target',
      { ...NO_SETTINGS, source: '1.8', target: '1.8' },
      ['-source', '1.8', '-target', '1.8'],
    ],
    [
      'what the arguments leave out',
      { ...NO_SETTINGS, source: '11', target: '11', args: ['-source', '11'] },
      ['-target', '11'],
    ],
    [
      'the compiler plug-in default when the POM sets no level',
      NO_SETTINGS,
      ['-source', '8', '-target', '8'],
    ],
    [
      'nothing for a level the arguments set with an equals sign',
      { ...NO_SETTINGS, args: ['--source=17', '--target=17'] },
      [],
    ],
  ])('passes %s', (_, compiler, expected) => {
    expect(languageLevel(compiler)).toEqual(expected);
  });
});

describe('isJavaModule', () => {
  it('recognizes explicit, automatic and multi-release modules, in jars and directories', () => {
    const root = temporary();
    const jars = {
      'explicit.jar': { 'module-info.class': '' },
      'automatic.jar': {
        'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\nAutomatic-Module-Name: demo.auto\n',
      },
      'versioned.jar': { 'META-INF/versions/11/module-info.class': '' },
      'plain.jar': { 'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\n', 'demo/A.class': '' },
    };
    for (const [name, entries] of Object.entries(jars)) {
      writeFileSync(path.join(root, name), zipOf(entries));
    }
    writeFiles(root, {
      'classes/module-info.class': '',
      'plain-classes/demo/A.class': '',
      'notes.txt': '',
    });

    expect(
      [...Object.keys(jars), 'classes', 'plain-classes', 'notes.txt'].filter((name) =>
        isJavaModule(path.join(root, name)),
      ),
    ).toEqual(['explicit.jar', 'automatic.jar', 'versioned.jar', 'classes']);
  });
});

describe('runJavacLint', () => {
  const warning = (file, line) =>
    `${file}:${String(line)}: warning: [rawtypes] found raw type: List`;

  it('keeps the base warnings of files unchanged since the base without compiling them', () => {
    const base = temporary();
    const head = temporary();
    const sources = {
      'src/main/java/demo/A.java': 'class A {}',
      'src/main/java/demo/B.java': 'class B {}',
    };
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

  it('compiles sources in the project encoding and skips source roots outside the module', () => {
    const root = temporary();
    const basedir = path.join(root, 'app');
    const latin =
      'package demo;\nclass A {\n  String name = "caf\u00e9";\n  java.util.List names;\n}\n';
    writeFiles(root, {
      'shared/demo/B.java': 'package demo;\nclass B { java.util.List names; }\n',
    });
    mkdirSync(path.join(basedir, 'src/main/java/demo'), { recursive: true });
    writeFileSync(path.join(basedir, 'src/main/java/demo/A.java'), Buffer.from(latin, 'latin1'));
    const reportDir = path.join(basedir, 'target/nitpicker');
    mkdirSync(reportDir, { recursive: true });
    const module = {
      basedir,
      sourceRoots: [path.join(basedir, 'src/main/java'), path.join(root, 'shared')],
      outputDirectory: path.join(basedir, 'target/classes'),
      compiler: { ...NO_SETTINGS, release: '17', encoding: 'ISO-8859-1' },
    };

    runJavacLint({ module, reportDir, classpaths: { mainCompile: [] }, baselineDir: undefined });

    const report = readFileSync(path.join(reportDir, 'javac-lint.txt'), 'utf8').split('\n');
    expect(report.filter((line) => !line.startsWith('Picked up '))).toEqual([
      'src/main/java/demo/A.java:4: warning: [rawtypes] found raw type: List',
      '  java.util.List names;',
      '           ^',
      '  missing type arguments for generic class List<E>',
      '  where E is a type-variable:',
      '    E extends Object declared in interface List',
      '1 warning',
      '',
    ]);
  });
});
