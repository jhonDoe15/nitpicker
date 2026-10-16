import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { javaCommand } from '../maven-command.mjs';
import { zipOf } from '../../builds/test-support/zip-writer.mjs';
import { languageLevel, lintCompatible } from './javac-options.mjs';
import { isJavaModule, runJavacLint } from './maven-javac-lint.mjs';

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
  it.each([
    '-Xmaxwarns',
    '-Xmaxerrs',
    '-processor',
    '-processorpath',
    '--processor-path',
    '--processor-module-path',
    '--module-path',
    '-p',
    '-d',
    '-s',
    '-h',
    '-encoding',
    '-cp',
    '-classpath',
    '--class-path',
    '-sourcepath',
    '--source-path',
  ])('drops %s and its value', (option) => {
    expect(lintCompatible(['-parameters', option, 'value', '--enable-preview'])).toEqual([
      '-parameters',
      '--enable-preview',
    ]);
  });

  it.each([
    '-Werror',
    '-Xlint:all',
    '-Xdoclint:none',
    '-proc:full',
    '-implicit:class',
    '-Xplugin:ErrorProne',
    '-J-Xmx2g',
    '--processor-path=/p.jar',
    '--processor-module-path=/p',
    '--module-path=/mods',
    '--class-path=/lib.jar',
    '--source-path=/src',
  ])('drops %s', (option) => {
    expect(lintCompatible(['-parameters', option, '--enable-preview'])).toEqual([
      '-parameters',
      '--enable-preview',
    ]);
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

  it('treats a jar that is not a zip archive as no module', () => {
    const root = temporary();
    writeFiles(root, { 'broken.jar': 'this is not a zip archive', 'empty.jar': '' });

    expect(['broken.jar', 'empty.jar'].map((name) => isJavaModule(path.join(root, name)))).toEqual([
      false,
      false,
    ]);
  });
});

function warning(file, line) {
  return `${file}:${String(line)}: warning: [rawtypes] found raw type: List`;
}

function rawTypeWarning(file, { line, source, caret }) {
  return [
    warning(file, line),
    source,
    caret,
    '  missing type arguments for generic class List<E>',
    '  where E is a type-variable:',
    '    E extends Object declared in interface List',
  ];
}

function javaModule(basedir, compiler) {
  return {
    basedir,
    sourceRoots: [path.join(basedir, 'src/main/java')],
    outputDirectory: path.join(basedir, 'target/classes'),
    compiler: { ...NO_SETTINGS, release: '17', ...compiler },
  };
}

function reportLines(reportDir, name) {
  const file = path.join(reportDir, name);
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n') : undefined;
}

function lint(module, baselineDir, libraries = []) {
  const reportDir = path.join(module.basedir, 'target/nitpicker');
  mkdirSync(reportDir, { recursive: true });
  runJavacLint({ module, reportDir, classpaths: { mainCompile: libraries }, baselineDir });
  return {
    report: reportLines(reportDir, 'javac-lint.txt'),
    failure: reportLines(reportDir, 'javac-lint-failed.txt'),
  };
}

describe('runJavacLint', () => {
  beforeEach(() => {
    vi.stubEnv('JAVA_TOOL_OPTIONS', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
    writeFiles(head, { 'target/nitpicker/javac-lint-failed.txt': 'old failure' });

    expect(lint(javaModule(head, NO_SETTINGS), base)).toEqual({
      report: [warning('src/main/java/demo/A.java', 3), ''],
      failure: undefined,
    });
  });

  it('adds the warnings of changed files to the base warnings of unchanged ones', () => {
    const base = temporary();
    const head = temporary();
    writeFiles(base, {
      'src/main/java/demo/A.java': 'package demo;\nclass A {}\n',
      'src/main/java/demo/B.java': 'package demo;\nclass B {}\n',
      'target/nitpicker/javac-lint.txt': `${warning('src/main/java/demo/A.java', 2)}\n1 warning\n`,
    });
    writeFiles(head, {
      'src/main/java/demo/A.java': 'package demo;\nclass A {}\n',
      'src/main/java/demo/B.java': 'package demo;\nclass B {\n  java.util.List names;\n}\n',
    });

    expect(lint(javaModule(head, {}), base)).toEqual({
      report: [
        warning('src/main/java/demo/A.java', 2),
        ...rawTypeWarning('src/main/java/demo/B.java', {
          line: 3,
          source: '  java.util.List names;',
          caret: '           ^',
        }),
        '1 warning',
        '',
      ],
      failure: undefined,
    });
  });

  it('reports suppressed warnings, reads the project encoding and skips roots outside the module', () => {
    const root = temporary();
    const basedir = path.join(root, 'app');
    const latin = [
      'package demo;',
      'class A {',
      '  @SuppressWarnings(',
      '      "rawtypes")',
      '  java.util.List hidden;',
      '  int café = 1;',
      '  java.util.List names;',
      '}',
      '',
    ].join('\n');
    writeFiles(root, {
      'shared/demo/B.java': 'package demo;\nclass B { java.util.List names; }\n',
    });
    mkdirSync(path.join(basedir, 'src/main/java/demo'), { recursive: true });
    writeFileSync(path.join(basedir, 'src/main/java/demo/A.java'), Buffer.from(latin, 'latin1'));
    const module = {
      ...javaModule(basedir, { encoding: 'ISO-8859-1' }),
      sourceRoots: [path.join(basedir, 'src/main/java'), path.join(root, 'shared')],
    };

    expect(lint(module, undefined)).toEqual({
      report: [
        ...rawTypeWarning('src/main/java/demo/A.java', {
          line: 5,
          source: '  java.util.List hidden;',
          caret: '           ^',
        }),
        ...rawTypeWarning('src/main/java/demo/A.java', {
          line: 7,
          source: '  java.util.List names;',
          caret: '           ^',
        }),
        '2 warnings',
        '',
      ],
      failure: undefined,
    });
  });

  it('lints a module with a descriptor whole, ignoring the base report', () => {
    const base = temporary();
    const head = temporary();
    const sources = {
      'src/main/java/module-info.java': 'module demo {}\n',
      'src/main/java/demo/A.java': 'package demo;\nclass A {\n  java.util.List names;\n}\n',
    };
    writeFiles(base, { ...sources, 'target/nitpicker/javac-lint.txt': 'stale\n' });
    writeFiles(head, sources);

    expect(lint(javaModule(head, {}), base)).toEqual({
      report: [
        ...rawTypeWarning('src/main/java/demo/A.java', {
          line: 3,
          source: '  java.util.List names;',
          caret: '           ^',
        }),
        '1 warning',
        '',
      ],
      failure: undefined,
    });
  });

  it('writes the compiler output to the failure report when the lint compile fails', () => {
    const head = temporary();
    writeFiles(head, { 'src/main/java/demo/A.java': 'package demo;\nclass A {\n  int x =\n}\n' });

    expect(lint(javaModule(head, {}), undefined)).toEqual({
      report: undefined,
      failure: [
        'src/main/java/demo/A.java:4: error: illegal start of expression',
        '}',
        '^',
        '1 error',
        '',
      ],
    });
  });

  it('retries with every library on the module path when a descriptor requires a plain jar', () => {
    const head = temporary();
    const library = temporary();
    writeFiles(library, {
      'src/lib/Greeter.java':
        'package lib;\npublic class Greeter {\n  public static String hi() { return "hi"; }\n}\n',
    });
    execFileSync(javaCommand('javac'), [
      '-d',
      path.join(library, 'classes'),
      path.join(library, 'src/lib/Greeter.java'),
    ]);
    const jar = path.join(library, 'greeter-lib-1.0.jar');
    writeFileSync(
      jar,
      zipOf({
        'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\n',
        'lib/Greeter.class': readFileSync(path.join(library, 'classes/lib/Greeter.class')),
      }),
    );
    writeFiles(head, {
      'src/main/java/module-info.java': 'module demo {\n  requires greeter.lib;\n}\n',
      'src/main/java/demo/A.java':
        'package demo;\nclass A {\n  java.util.List names = java.util.List.of(lib.Greeter.hi());\n}\n',
    });

    expect(lint(javaModule(head, {}), undefined, [jar])).toEqual({
      report: [
        ...rawTypeWarning('src/main/java/demo/A.java', {
          line: 3,
          source: '  java.util.List names = java.util.List.of(lib.Greeter.hi());',
          caret: '           ^',
        }),
        '1 warning',
        '',
      ],
      failure: undefined,
    });
  });
});
