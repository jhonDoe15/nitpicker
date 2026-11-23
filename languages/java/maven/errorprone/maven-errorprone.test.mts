import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseXml } from '../../../../shared/ingest/report-records.mts';
import { compilerSettings } from './maven-compiler.mts';
import { compileArgumentFiles, runnerFlags } from './maven-errorprone.mts';

const NOW = 1_000_000;
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-errorprone-unit-'));
  tempDirs.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, 'utf8');
  }
  return root;
}

function readArgs(file: string): { readonly lines: string[]; readonly sources: string[] } {
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  const index = lines.indexOf('--sources');
  return {
    lines: index === -1 ? lines : lines.slice(0, index),
    sources: index === -1 ? [] : lines.slice(index + 1),
  };
}

function projectCompiler(body: string) {
  return compilerSettings(parseXml(`<project><artifactId>app</artifactId>${body}</project>`));
}

describe('runnerFlags', () => {
  it('runs a worker per tool slot on the memory of two slots, until half a minute before the limit', () => {
    expect(runnerFlags(600_000, { slots: 4, now: NOW })).toEqual([
      '-Dnitpicker.errorprone.workers=4',
      '-XX:MaxRAMPercentage=37.5',
      '-XX:GCTimeRatio=4',
      '-Dnitpicker.errorprone.deadline=1570000',
    ]);
  });

  it.each([[0], [30_000], [Number.POSITIVE_INFINITY]])(
    'leaves the deadline out for a limit of %d ms',
    (timeoutMs) => {
      expect(runnerFlags(timeoutMs, { slots: 1, now: NOW })).toEqual([
        '-Dnitpicker.errorprone.workers=1',
        '-XX:MaxRAMPercentage=75.0',
        '-XX:GCTimeRatio=4',
      ]);
    },
  );
});

describe('compileArgumentFiles', () => {
  it('splits excluded files into their own multi-release execution argument file (Keycloak pattern)', () => {
    const root = workspace({
      'src/main/java/org/keycloak/jose/jwk/JWK.java': 'package org.keycloak.jose.jwk; class JWK {}',
      'src/main/java/org/keycloak/jose/jwk/EdECUtilsImpl.java':
        'package org.keycloak.jose.jwk; class EdECUtilsImpl {}',
    });
    const compiler = projectCompiler(`<build><plugins><plugin>
      <artifactId>maven-compiler-plugin</artifactId>
      <configuration>
        <release>8</release>
        <excludes><exclude>org/keycloak/jose/jwk/EdECUtilsImpl.java</exclude></excludes>
      </configuration>
      <executions>
        <execution>
          <id>compile-java15</id><phase>compile</phase><goals><goal>compile</goal></goals>
          <configuration>
            <release>15</release>
            <includes><include>org/keycloak/jose/jwk/EdECUtilsImpl.java</include></includes>
            <excludes combine.self="override" />
          </configuration>
        </execution>
      </executions>
    </plugin></plugins></build>`);
    const work = path.join(root, 'work');
    const files = compileArgumentFiles(
      {
        module: {
          basedir: root,
          outputDirectory: path.join(root, 'target/classes'),
          testOutputDirectory: path.join(root, 'target/test-classes'),
          sourceRoots: [path.join(root, 'src/main/java')],
          testSourceRoots: [path.join(root, 'src/test/java')],
          compiler,
        },
        tools: { errorprone: [] },
        classpaths: { mainCompile: [], mainRuntime: [], testCompile: [], testRuntime: [] },
        configs: {},
      },
      work,
      false,
    );

    expect(files.map((file) => path.basename(file))).toStrictEqual([
      'main.args',
      'main-compile-java15.args',
    ]);
    const main = readArgs(files[0] ?? '');
    const java15 = readArgs(files[1] ?? '');
    expect(main.lines).toContain('--release=8');
    expect(main.sources).toStrictEqual([
      path.join(root, 'src/main/java/org/keycloak/jose/jwk/JWK.java'),
    ]);
    expect(java15.lines).toContain('--release=15');
    expect(java15.sources).toStrictEqual([
      path.join(root, 'src/main/java/org/keycloak/jose/jwk/EdECUtilsImpl.java'),
    ]);
  });

  it('honors testExcludes and extra testCompile executions without affecting main sources', () => {
    const root = workspace({
      'src/main/java/demo/App.java': 'package demo; class App {}',
      'src/test/java/demo/FastTest.java': 'package demo; class FastTest {}',
      'src/test/java/demo/SlowTest.java': 'package demo; class SlowTest {}',
    });
    const compiler = projectCompiler(`<build><plugins><plugin>
      <artifactId>maven-compiler-plugin</artifactId>
      <configuration>
        <release>17</release>
        <testExcludes><testExclude>**/SlowTest.java</testExclude></testExcludes>
      </configuration>
      <executions>
        <execution>
          <id>test-compile-java21</id><goals><goal>testCompile</goal></goals>
          <configuration>
            <release>21</release>
            <testIncludes><testInclude>**/SlowTest.java</testInclude></testIncludes>
            <testExcludes combine.self="override" />
          </configuration>
        </execution>
      </executions>
    </plugin></plugins></build>`);
    const files = compileArgumentFiles(
      {
        module: {
          basedir: root,
          outputDirectory: path.join(root, 'target/classes'),
          testOutputDirectory: path.join(root, 'target/test-classes'),
          sourceRoots: [path.join(root, 'src/main/java')],
          testSourceRoots: [path.join(root, 'src/test/java')],
          compiler,
        },
        tools: { errorprone: [] },
        classpaths: { mainCompile: [], mainRuntime: [], testCompile: [], testRuntime: [] },
        configs: {},
      },
      path.join(root, 'work'),
      false,
    );

    expect(files.map((file) => path.basename(file))).toStrictEqual([
      'main.args',
      'test.args',
      'test-test-compile-java21.args',
    ]);
    expect(readArgs(files[1] ?? '').sources).toStrictEqual([
      path.join(root, 'src/test/java/demo/FastTest.java'),
    ]);
    const extraTest = readArgs(files[2] ?? '');
    expect(extraTest.lines).toContain('--release=21');
    expect(extraTest.lines).toContain('--test-only');
    expect(extraTest.sources).toStrictEqual([path.join(root, 'src/test/java/demo/SlowTest.java')]);
  });

  it('passes --module-path only for the execution whose filtered sources include module-info.java', () => {
    const root = workspace({
      'src/main/java/demo/App.java': 'package demo; class App {}',
      'src/main/java/module-info.java': 'module demo {}',
      'libs/dep.jar': '',
    });
    const compiler = projectCompiler(`<build><plugins><plugin>
      <artifactId>maven-compiler-plugin</artifactId>
      <configuration>
        <release>8</release>
        <excludes><exclude>module-info.java</exclude></excludes>
      </configuration>
      <executions>
        <execution>
          <id>compile-java9</id><goals><goal>compile</goal></goals>
          <configuration>
            <release>9</release>
            <includes><include>module-info.java</include></includes>
            <excludes combine.self="override" />
          </configuration>
        </execution>
      </executions>
    </plugin></plugins></build>`);
    const files = compileArgumentFiles(
      {
        module: {
          basedir: root,
          outputDirectory: path.join(root, 'target/classes'),
          testOutputDirectory: path.join(root, 'target/test-classes'),
          sourceRoots: [path.join(root, 'src/main/java')],
          testSourceRoots: [],
          compiler,
        },
        tools: { errorprone: [] },
        classpaths: {
          mainCompile: [path.join(root, 'libs/dep.jar')],
          mainRuntime: [],
          testCompile: [],
          testRuntime: [],
        },
        configs: {},
      },
      path.join(root, 'work'),
      'all',
    );

    const main = readArgs(files[0] ?? '');
    const java9 = readArgs(files[1] ?? '');
    expect(main.lines).not.toContain('--module-path');
    expect(main.sources).toStrictEqual([path.join(root, 'src/main/java/demo/App.java')]);
    expect(java9.lines).toContain('--release=9');
    expect(java9.lines).toContain('--module-path');
    expect(java9.sources).toStrictEqual([path.join(root, 'src/main/java/module-info.java')]);
  });
});
