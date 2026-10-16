import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipOf } from '../test-support/zip-writer.mjs';
import {
  JAVAC,
  RAW_NAMES,
  baseCache,
  javaPlan,
  lint,
  namesWarning,
  rawTypeWarning,
  removeTemporaries,
  temporary,
  warning,
  warningHeaders,
  writeFiles,
} from './test-support/lint-project.mjs';

describe('runJavacLint', () => {
  beforeEach(() => {
    vi.stubEnv('JAVA_TOOL_OPTIONS', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    removeTemporaries();
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

  it('compiles a generated source once when the project lists it among its sources', () => {
    const head = temporary();
    writeFiles(head, {
      'src/main/java/module-info.java': 'module demo {}\n',
      'src/main/java/demo/A.java':
        'package demo;\nclass A {\n  Object made = new demo.made.Made();\n}\n',
      'target/generated-sources/annotations/demo/made/Made.java':
        'package demo.made;\npublic class Made {}\n',
    });
    const generated = path.join(head, 'target/generated-sources/annotations');
    const plan = javaPlan(head, { generatedSources: [generated] });

    expect(
      lint(
        { ...plan, sources: [...plan.sources, path.join(generated, 'demo/made/Made.java')] },
        undefined,
      ),
    ).toEqual({ report: [''], failure: undefined });
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
