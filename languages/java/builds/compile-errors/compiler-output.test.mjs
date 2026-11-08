import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { compileErrorsIn } from './compiler-output.mjs';

const ROOT = '/work/head';
const JAVA = `${ROOT}/src/main/java/demo/Greeter.java`;
const KOTLIN = `${ROOT}/src/main/kotlin/demo/Greeter.kt`;
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('compileErrorsIn', () => {
  it('reads javac and Error Prone errors with the symbol javac names', () => {
    const output = [
      `${JAVA}:5: error: cannot find symbol`,
      '    return missing();',
      '           ^',
      '  symbol:   method missing()',
      '  location: class Greeter',
      `${JAVA}:9: error: [DeadException] Exception created but not thrown`,
      `${JAVA}:12: warning: [deprecation] old() in Greeter has been deprecated`,
      '2 errors',
    ].join('\n');

    expect(compileErrorsIn(output, ROOT)).toEqual([
      {
        path: 'src/main/java/demo/Greeter.java',
        line: 5,
        message: 'cannot find symbol (method missing())',
      },
      {
        path: 'src/main/java/demo/Greeter.java',
        line: 9,
        message: '[DeadException] Exception created but not thrown',
      },
    ]);
  });

  it('reads the Maven compiler format once, though Maven prints it twice', () => {
    const output = [
      '[ERROR] COMPILATION ERROR : ',
      `[ERROR] ${JAVA}:[5,12] cannot find symbol`,
      '  symbol:   method missing()',
      '  location: class demo.Greeter',
      '[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.13.0:compile',
      `[ERROR] ${JAVA}:[5,12] cannot find symbol`,
      '[ERROR]   symbol:   method missing()',
    ].join('\n');

    expect(compileErrorsIn(output, ROOT)).toEqual([
      {
        path: 'src/main/java/demo/Greeter.java',
        line: 5,
        column: 12,
        message: 'cannot find symbol (method missing())',
      },
    ]);
  });

  it.each([
    [`e: ${pathToFileURL(KOTLIN).href}:5:9 Unresolved reference 'missing'.`],
    [`e: ${KOTLIN}: (5, 9): Unresolved reference 'missing'.`],
    [`[ERROR] ${pathToFileURL(KOTLIN).href}:[5,9] Unresolved reference 'missing'.`],
    [`[ERROR] ${KOTLIN}: (5, 9) Unresolved reference 'missing'.`],
  ])('reads a Kotlin compiler error from Gradle or Maven: %s', (line) => {
    expect(compileErrorsIn(line, ROOT)).toEqual([
      {
        path: 'src/main/kotlin/demo/Greeter.kt',
        line: 5,
        column: 9,
        message: "Unresolved reference 'missing'.",
      },
    ]);
  });

  it('ignores warnings, errors outside the project and lines that only look like positions', () => {
    const output = [
      `w: ${pathToFileURL(KOTLIN).href}:3:1 Parameter 'x' is never used.`,
      '/tmp/nitpicker-tool/CpdReport.java:4: error: cannot find symbol',
      `${KOTLIN}:5:9 Unresolved reference 'missing'.`,
      '    at demo.GreeterTest.greets(GreeterTest.java:12)',
    ].join('\n');

    expect(compileErrorsIn(output, ROOT)).toEqual([]);
  });

  it('resolves a relative path against the project and follows a linked project folder', () => {
    const real = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-compile-')));
    roots.push(real);
    const project = path.join(real, 'project');
    mkdirSync(path.join(project, 'src'), { recursive: true });
    writeFileSync(path.join(project, 'src/A.java'), 'class A {}\n');
    const link = path.join(real, 'link');
    symlinkSync(project, link);
    const output = [
      'src/A.java:1: error: class, interface, enum, or record expected',
      `${project}/src/A.java:2: error: reached end of file while parsing`,
    ].join('\n');

    expect(
      compileErrorsIn(output, link).map(({ path: file, line }) => `${file}:${String(line)}`),
    ).toEqual(['src/A.java:1', 'src/A.java:2']);
  });
});
