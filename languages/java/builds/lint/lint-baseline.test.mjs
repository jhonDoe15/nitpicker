import { chmodSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipOf } from '../test-support/zip-writer.mjs';
import {
  JAVAC,
  RAW_NAMES,
  baseCache,
  compileClasses,
  javaPlan,
  lint,
  namesWarning,
  removeTemporaries,
  temporary,
  warning,
  warningHeaders,
  writeFiles,
} from './test-support/lint-project.mjs';

function fakeJavac(directory) {
  const javac = path.join(directory, 'bin/javac');
  writeFiles(directory, { 'bin/javac': '#!/bin/sh\necho "javac 0.0-other"\n' });
  chmodSync(javac, 0o755);
  return javac;
}

describe('the differential lint', () => {
  beforeEach(() => {
    vi.stubEnv('JAVA_TOOL_OPTIONS', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    removeTemporaries();
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
      (base) => {
        baseCache(javaPlan(base, { classpath: [path.join(base, 'lib/dep.jar')] }), [
          warning('src/main/java/demo/A.java', 9),
        ]);
      },
    ],
    [
      'the base report has no fingerprint',
      (base) => {
        writeFiles(base, {
          'target/nitpicker-lint/javac-lint.txt': `${warning('src/main/java/demo/A.java', 9)}\n`,
        });
      },
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

  it.each([
    ['a lombok.config changed', { 'lombok.config': 'lombok.accessors.chain = true\n' }],
    ['a project jar changed but kept its size', { 'lib/dep.jar': zipOf({ 'dep/A.class': 'y' }) }],
  ])('lints every file again when %s since the base', (_, headFiles) => {
    const base = temporary();
    const head = temporary();
    const files = {
      'src/main/java/demo/A.java': RAW_NAMES,
      'lombok.config': 'lombok.accessors.fluent = true\n',
      'lib/dep.jar': zipOf({ 'dep/A.class': 'x' }),
    };
    writeFiles(base, files);
    writeFiles(head, { ...files, ...headFiles });
    baseCache(javaPlan(base, { classpath: [path.join(base, 'lib/dep.jar')] }), [
      warning('src/main/java/demo/A.java', 9),
    ]);

    const plan = javaPlan(head, { classpath: [path.join(head, 'lib/dep.jar')] });

    expect(lint(plan, base).report).toEqual([
      ...namesWarning('src/main/java/demo/A.java'),
      '1 warning',
      '',
    ]);
  });

  it.each([
    ['the javac version', 'lombok.accessors.fluent = true\n', fakeJavac],
    ['a lombok.config above the root', 'lombok.accessors.chain = true\n', () => JAVAC],
  ])('lints every file again when %s changed since the base', (_, headConfig, baseJavac) => {
    const [baseTop, headTop] = [temporary(), temporary()];
    const files = { 'repo/src/main/java/demo/A.java': RAW_NAMES };
    writeFiles(baseTop, { ...files, 'lombok.config': 'lombok.accessors.fluent = true\n' });
    writeFiles(headTop, { ...files, 'lombok.config': headConfig });
    const base = path.join(baseTop, 'repo');
    baseCache(javaPlan(base, { javac: baseJavac(baseTop) }), [
      warning('src/main/java/demo/A.java', 9),
    ]);

    expect(lint(javaPlan(path.join(headTop, 'repo')), base).report).toEqual([
      ...namesWarning('src/main/java/demo/A.java'),
      '1 warning',
      '',
    ]);
  });

  it('reuses the base warnings when the compiler arguments differ only by the project folder', () => {
    const base = temporary();
    const head = temporary();
    writeFiles(base, { 'src/main/java/demo/A.java': RAW_NAMES });
    writeFiles(head, { 'src/main/java/demo/A.java': RAW_NAMES });
    const argsUnder = (root) => ({ args: [`-Aproject.folder=${root}/src`] });
    baseCache(javaPlan(base, { compiler: argsUnder(base) }), [
      warning('src/main/java/demo/A.java', 9),
    ]);

    expect(lint(javaPlan(head, { compiler: argsUnder(head) }), base).report).toEqual([
      warning('src/main/java/demo/A.java', 9),
      '',
    ]);
  });

  it("adds the changed files' warnings to the unchanged files' base warnings, ignoring a class path argument", () => {
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

  it('reports the warnings an unchanged file gets when a class it uses turns generic and deprecated', () => {
    const base = temporary();
    const head = temporary();
    const user = [
      'package shop;',
      '',
      'public final class BoxUser {',
      '  private BoxUser() {}',
      '',
      '  public static String show() {',
      '    Box box = new Box("x");',
      '    return box.label() + box.value();',
      '  }',
      '}',
      '',
    ].join('\n');
    const box = (type, annotation) =>
      [
        'package shop;',
        `public class Box${type === 'T' ? '<T>' : ''} {`,
        `  private final ${type} value;`,
        `  public Box(${type} value) {`,
        '    this.value = value;',
        '  }',
        `  public ${type} value() {`,
        '    return value;',
        '  }',
        `  ${annotation}public String label() {`,
        '    return "box";',
        '  }',
        '}',
        '',
      ].join('\n');
    writeFiles(base, {
      'src/main/java/shop/BoxUser.java': user,
      'src/main/java/shop/Box.java': box('Object', ''),
    });
    writeFiles(head, {
      'src/main/java/shop/BoxUser.java': user,
      'src/main/java/shop/Box.java': box('T', '@Deprecated '),
    });
    baseCache(javaPlan(base), []);
    compileClasses(javaPlan(head));

    expect(warningHeaders(lint(javaPlan(head), base).report)).toEqual([
      'src/main/java/shop/BoxUser.java:7: warning: [rawtypes] found raw type: Box',
      'src/main/java/shop/BoxUser.java:7: warning: [rawtypes] found raw type: Box',
      'src/main/java/shop/BoxUser.java:7: warning: [unchecked] unchecked call to Box(T) ' +
        'as a member of the raw type Box',
      'src/main/java/shop/BoxUser.java:8: warning: [deprecation] label() in Box has been deprecated',
    ]);
  });
});
