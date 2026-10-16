import { execFileSync } from 'node:child_process';
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipOf } from '../test-support/zip-writer.mjs';
import { lintFingerprint } from './lint-baseline.mjs';
import { runJavacLint } from './javac-lint-runner.mjs';

const roots = [];
const JAVAC = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'javac') : 'javac';
const NO_SETTINGS = { release: '17', source: undefined, target: undefined, args: [] };

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

function javaFilesUnder(directory) {
  return existsSync(directory)
    ? readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
        .map((entry) => path.join(entry.parentPath, entry.name))
    : [];
}

function javaPlan(root, { basedir = root, compiler = {}, classpath = [], ...rest } = {}) {
  return {
    root,
    basedir,
    reportRoot: basedir,
    sources: javaFilesUnder(path.join(basedir, 'src/main/java')),
    generatedSources: [],
    classDirectory: path.join(basedir, 'target/classes'),
    classpath,
    processorPath: classpath,
    javac: JAVAC,
    compiler: { ...NO_SETTINGS, ...compiler },
    workDirectory: path.join(basedir, 'target/nitpicker-lint/work'),
    cacheDirectory: path.join(basedir, 'target/nitpicker-lint'),
    ...rest,
  };
}

function compileClasses(plan) {
  execFileSync(JAVAC, ['-d', plan.classDirectory, ...plan.sources]);
}

function baseCache(plan, lines) {
  writeFiles(plan.cacheDirectory, {
    'javac-lint.txt': [...lines, ''].join('\n'),
    'javac-lint-fingerprint.txt': lintFingerprint(plan),
  });
}

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

function namesWarning(file, line = 3) {
  return rawTypeWarning(file, { line, source: '  java.util.List names;', caret: '           ^' });
}

function reportLines(reportDir, name) {
  const file = path.join(reportDir, name);
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n') : undefined;
}

function lint(plan, baselineRoot) {
  const reportDir = path.join(plan.basedir, 'target/nitpicker');
  mkdirSync(reportDir, { recursive: true });
  runJavacLint(plan, { reportDir, baselineRoot });
  return {
    report: reportLines(reportDir, 'javac-lint.txt'),
    failure: reportLines(reportDir, 'javac-lint-failed.txt'),
  };
}

function warningHeaders(report) {
  return report.filter((line) => line.includes(': warning: ['));
}

const RAW_NAMES = 'package demo;\nclass A {\n  java.util.List names;\n}\n';

describe('runJavacLint', () => {
  beforeEach(() => {
    vi.stubEnv('JAVA_TOOL_OPTIONS', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
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
    baseCache(javaPlan(base), [
      warning('src/main/java/demo/A.java', 3),
      '  List all();',
      warning('src/main/java/demo/Gone.java', 1),
      '1 warning',
    ]);
    writeFiles(head, { 'target/nitpicker/javac-lint-failed.txt': 'old failure' });

    expect(lint(javaPlan(head), base)).toEqual({
      report: [warning('src/main/java/demo/A.java', 3), ''],
      failure: undefined,
    });
  });

  it.each([
    [
      'a library changed since the base',
      (base) =>
        baseCache(javaPlan(base, { classpath: [path.join(base, 'lib/dep.jar')] }), [
          warning('src/main/java/demo/A.java', 9),
        ]),
    ],
    [
      'the base report has no fingerprint',
      (base) =>
        writeFiles(base, {
          'target/nitpicker-lint/javac-lint.txt': `${warning('src/main/java/demo/A.java', 9)}\n`,
        }),
    ],
  ])('lints every file again when %s', (_, writeBase) => {
    const base = temporary();
    const head = temporary();
    writeFiles(base, {
      'src/main/java/demo/A.java': RAW_NAMES,
      'lib/dep.jar': zipOf({ 'dep/Old.class': '' }),
    });
    writeFiles(head, {
      'src/main/java/demo/A.java': RAW_NAMES,
      'lib/dep.jar': zipOf({ 'dep/Old.class': '', 'dep/New.class': '' }),
    });
    writeBase(base);

    const plan = javaPlan(head, { classpath: [path.join(head, 'lib/dep.jar')] });

    expect(lint(plan, base).report).toEqual([
      ...namesWarning('src/main/java/demo/A.java'),
      '1 warning',
      '',
    ]);
  });

  it('adds the warnings of changed files to the base warnings of unchanged ones, ignoring a class path argument', () => {
    const base = temporary();
    const head = temporary();
    writeFiles(base, {
      'src/main/java/demo/A.java': 'package demo;\nclass A {}\n',
      'src/main/java/demo/B.java': 'package demo;\nclass B {}\n',
    });
    writeFiles(head, {
      'src/main/java/demo/A.java': 'package demo;\nclass A {}\n',
      'src/main/java/demo/B.java': 'package demo;\nclass B {\n  java.util.List names;\n  A a;\n}\n',
    });
    const compiler = { args: ['-cp', path.join(head, 'nowhere')] };
    baseCache(javaPlan(base, { compiler }), [warning('src/main/java/demo/A.java', 2), '1 warning']);
    compileClasses(javaPlan(head));

    expect(lint(javaPlan(head, { compiler }), base)).toEqual({
      report: [
        warning('src/main/java/demo/A.java', 2),
        ...namesWarning('src/main/java/demo/B.java'),
        '1 warning',
        '',
      ],
      failure: undefined,
    });
  });

  it('lints an unchanged file again when a class it uses, directly or through a subclass, changed', () => {
    const base = temporary();
    const head = temporary();
    const unchanged = {
      'src/main/java/demo/Sub.java': 'package demo;\npublic class Sub extends Box {}\n',
      'src/main/java/demo/User.java':
        'package demo;\nclass User {\n  String name(Box box) {\n    return box.label();\n  }\n}\n',
      'src/main/java/demo/Caller.java':
        'package demo;\nclass Caller {\n  String name() {\n    return new Sub().label();\n  }\n}\n',
      'src/main/java/demo/Other.java': 'package demo;\nclass Other {}\n',
    };
    const box = (annotation) =>
      `package demo;\npublic class Box {\n  ${annotation}public String label() {\n    return "";\n  }\n}\n`;
    writeFiles(base, { ...unchanged, 'src/main/java/demo/Box.java': box('') });
    writeFiles(head, { ...unchanged, 'src/main/java/demo/Box.java': box('@Deprecated ') });
    baseCache(javaPlan(base), [warning('src/main/java/demo/Other.java', 9)]);
    compileClasses(javaPlan(head));

    expect(warningHeaders(lint(javaPlan(head), base).report)).toEqual([
      warning('src/main/java/demo/Other.java', 9),
      'src/main/java/demo/Caller.java:4: warning: [deprecation] label() in Box has been deprecated',
      'src/main/java/demo/User.java:4: warning: [deprecation] label() in Box has been deprecated',
    ]);
  });

  it('reports suppressed warnings, reads the project encoding and skips sources outside the module', () => {
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
    const plan = javaPlan(root, { basedir, compiler: { encoding: 'ISO-8859-1' } });
    const shared = path.join(root, 'shared/demo/B.java');

    expect(lint({ ...plan, sources: [...plan.sources, shared] }, undefined)).toEqual({
      report: [
        ...rawTypeWarning('src/main/java/demo/A.java', {
          line: 5,
          source: '  java.util.List hidden;',
          caret: '           ^',
        }),
        ...namesWarning('src/main/java/demo/A.java', 7),
        '2 warnings',
        '',
      ],
      failure: undefined,
    });
  });

  it('writes paths relative to the report root, the analysis root on Gradle', () => {
    const root = temporary();
    const basedir = path.join(root, 'app');
    writeFiles(basedir, { 'src/main/java/demo/A.java': RAW_NAMES });
    const plan = { ...javaPlan(root, { basedir }), reportRoot: root };

    expect(warningHeaders(lint(plan, undefined).report)).toEqual([
      warning('app/src/main/java/demo/A.java', 3),
    ]);
  });

  it('lints a module with a descriptor whole, ignoring the base report', () => {
    const base = temporary();
    const head = temporary();
    const sources = {
      'src/main/java/module-info.java': 'module demo {}\n',
      'src/main/java/demo/A.java': RAW_NAMES,
    };
    writeFiles(base, sources);
    writeFiles(head, sources);
    baseCache(javaPlan(base), ['stale']);

    expect(lint(javaPlan(head), base)).toEqual({
      report: [...namesWarning('src/main/java/demo/A.java'), '1 warning', ''],
      failure: undefined,
    });
  });

  it('compiles the generated sources with a module, without reporting their warnings', () => {
    const head = temporary();
    writeFiles(head, {
      'src/main/java/module-info.java': 'module demo {}\n',
      'src/main/java/demo/A.java':
        'package demo;\nclass A {\n  java.util.List names = demo.made.Made.names();\n}\n',
      'target/generated-sources/annotations/demo/made/Made.java':
        'package demo.made;\npublic class Made {\n  public static java.util.List names() {\n    return null;\n  }\n}\n',
    });
    const generatedSources = [path.join(head, 'target/generated-sources/annotations')];

    expect(lint(javaPlan(head, { generatedSources }), undefined)).toEqual({
      report: [
        ...rawTypeWarning('src/main/java/demo/A.java', {
          line: 3,
          source: '  java.util.List names = demo.made.Made.names();',
          caret: '           ^',
        }),
        '2 warnings',
        '',
      ],
      failure: undefined,
    });
  });

  it('writes the compiler output to the failure report when the lint compile fails', () => {
    const head = temporary();
    writeFiles(head, { 'src/main/java/demo/A.java': 'package demo;\nclass A {\n  int x =\n}\n' });

    expect(lint(javaPlan(head), undefined)).toEqual({
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
    execFileSync(JAVAC, [
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

    expect(lint(javaPlan(head, { classpath: [jar] }), undefined)).toEqual({
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
