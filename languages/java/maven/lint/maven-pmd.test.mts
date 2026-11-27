import {
  chmodSync,
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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipOf } from '../../../../shared/test-support/archives/zip-writer.mts';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mts';
import { runPmd } from '../maven-lint.mts';
import { parseJson, textsOf } from '../../../../shared/values/readers.mts';
import { fakeJava, sourceModule } from '../__tests__/maven-lint-support.mts';

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

type PmdRun = { rulesets: string[]; mainRules: string[]; testRules: string[]; reportDir: string };
type PmdSetup = { springRules?: string; reactor?: boolean; mainCompile?: string[] };

describe.skipIf(process.platform === 'win32')('runPmd', () => {
  function pmdRun(spring: boolean, setup: PmdSetup = {}): PmdRun {
    const { springRules, reactor = false, mainCompile = [] } = setup;
    const basedir = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-pmd-'));
    roots.push(basedir);
    fakeJava(basedir, '--report-file');
    const mainRoot = path.join(basedir, 'src/main/java');
    const testRoot = path.join(basedir, 'src/test/java');
    const reportDir = path.join(basedir, 'report');
    for (const directory of [mainRoot, testRoot, reportDir]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(path.join(mainRoot, 'Demo.java'), 'class Demo {}\n');
    const module = sourceModule({
      basedir,
      sourceRoots: [mainRoot],
      testSourceRoots: [testRoot],
      compiler: { compilerArgs: [] },
    });
    runPmd({
      module,
      reportDir,
      tools: { pmd: ['pmd.jar'] },
      classpaths: { mainCompile, testCompile: [] },
      configs: { pmd: {} },
      spring,
      springRules,
      reactor,
    });
    const args = textsOf(parseJson(readFileSync(path.join(basedir, 'arguments.json'), 'utf8')));
    const refs = (name: string): string[] =>
      [...readFileSync(path.join(reportDir, name), 'utf8').matchAll(/<rule ref="([^"]+)"/g)].map(
        ([, ref]) => ref ?? '',
      );
    return {
      rulesets: (args[args.indexOf('--rulesets') + 1] ?? '').split(','),
      mainRules: refs('pmd-main.xml'),
      testRules: refs('pmd-tests.xml'),
      reportDir,
    };
  }

  const shipped = (name: string): string => path.join(GRADLE_DIRECTORY, name);
  const mainWrapper = (run: PmdRun, ...rules: string[]): string =>
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ruleset name="nitpicker-main" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">',
      "  <description>Nitpicker's main-only rules on main sources only.</description>",
      `  <exclude-pattern>${path.dirname(run.reportDir)}/src/test/java/.*</exclude-pattern>`,
      ...rules.map((rule) => `  ${rule}`),
      '</ruleset>',
      '',
    ].join('\n');

  it('adds the Spring rule sets to the main-only and test-only wrappers of a Spring module', () => {
    const run = pmdRun(true, { mainCompile: ['/m2/spring-context-6.1.0.jar'] });

    expect(run.rulesets.slice(0, 3)).toEqual([
      shipped('pmd-ruleset.xml'),
      path.join(run.reportDir, 'pmd-tests.xml'),
      path.join(run.reportDir, 'pmd-main.xml'),
    ]);
    expect(
      run.rulesets.slice(3).every((file: string) => path.dirname(file) === run.reportDir),
    ).toBe(true);
    expect(run.mainRules).toEqual([shipped('pmd-main-ruleset.xml'), shipped('spring-ruleset.xml')]);
    const excluded = [
      'SpringDataRowWriteInLoop',
      'SpringDataNoFlush',
      'SpringDataNoSaveInLoop',
      'SpringDataSaveInLoopHelper',
      'SpringDataNativeQuery',
    ]
      .map((name) => `<exclude name="${name}"/>`)
      .join('');
    expect(readFileSync(path.join(run.reportDir, 'pmd-main.xml'), 'utf8')).toEqual(
      mainWrapper(
        run,
        `<rule ref="${shipped('pmd-main-ruleset.xml')}"/>`,
        `<rule ref="${shipped('spring-ruleset.xml')}">${excluded}</rule>`,
      ),
    );
    expect(run.testRules).toEqual([
      shipped('pmd-test-ruleset.xml'),
      shipped('spring-test-ruleset.xml'),
    ]);
  });

  it('keeps the Spring Data rules on when the compile classpath is unknown', () => {
    const run = pmdRun(true);

    expect(run.mainRules).toEqual([
      shipped('pmd-main-ruleset.xml'),
      `${shipped('pmd-main-ruleset.xml')}/IoCallInLoop`,
      shipped('spring-ruleset.xml'),
    ]);
    expect(readFileSync(path.join(run.reportDir, 'pmd-main.xml'), 'utf8')).not.toContain(
      '<exclude name="SpringData',
    );
  });

  it('runs the Spring Data rules and leaves repository writes to them when Spring Data is present', () => {
    const run = pmdRun(true, { mainCompile: ['/m2/spring-data-jpa-3.3.0.jar'] });

    expect(run.mainRules).toEqual([
      shipped('pmd-main-ruleset.xml'),
      `${shipped('pmd-main-ruleset.xml')}/IoCallInLoop`,
      shipped('spring-ruleset.xml'),
    ]);
    expect(readFileSync(path.join(run.reportDir, 'pmd-main.xml'), 'utf8')).toEqual(
      mainWrapper(
        run,
        `<rule ref="${shipped('pmd-main-ruleset.xml')}"><exclude name="IoCallInLoop"/></rule>`,
        `<rule ref="${shipped('pmd-main-ruleset.xml')}/IoCallInLoop"><properties><property name="springData" value="true"/></properties></rule>`,
        `<rule ref="${shipped('spring-ruleset.xml')}"></rule>`,
      ),
    );
  });

  it('adds the Reactor rule set to the main-only wrapper of a module that uses Reactor', () => {
    const run = pmdRun(false, { reactor: true });

    expect(run.mainRules).toEqual([
      shipped('pmd-main-ruleset.xml'),
      shipped('reactor-ruleset.xml'),
    ]);
    expect(run.testRules).toEqual([shipped('pmd-test-ruleset.xml')]);
  });

  it('takes the Spring rule set written for the project when it names annotations of its own', () => {
    const own = path.join(tmpdir(), 'spring-ruleset-project.xml');

    expect(pmdRun(true, { springRules: own }).mainRules.at(-1)).toBe(own);
    expect(pmdRun(false, { springRules: own }).mainRules).toEqual([
      shipped('pmd-main-ruleset.xml'),
    ]);
  });

  it('leaves the Spring rule sets out of a module without Spring', () => {
    const run = pmdRun(false);

    expect({ main: run.mainRules, tests: run.testRules }).toEqual({
      main: [shipped('pmd-main-ruleset.xml')],
      tests: [shipped('pmd-test-ruleset.xml')],
    });
  });

  it('writes an empty report and runs nothing for a module whose roots hold no Java file', () => {
    const basedir = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-pmd-'));
    roots.push(basedir);
    const mainRoot = path.join(basedir, 'src/main/java');
    const reportDir = path.join(basedir, 'report');
    for (const directory of [mainRoot, reportDir]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(path.join(mainRoot, 'Demo.kt'), 'class Demo\n');
    runPmd({
      module: sourceModule({ basedir, sourceRoots: [mainRoot] }),
      reportDir,
      tools: { pmd: ['pmd.jar'] },
      classpaths: { mainCompile: [], testCompile: [] },
      configs: { pmd: {} },
      spring: false,
    });

    expect(readdirSync(reportDir)).toEqual(['pmd.sarif']);
    expect(readFileSync(path.join(reportDir, 'pmd.sarif'), 'utf8')).toBe(
      '{"version":"2.1.0","runs":[]}',
    );
  });

  it('runs no PMD when the engine runs every rule', () => {
    const basedir = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-pmd-'));
    roots.push(basedir);
    fakeJava(basedir, '--report-file');
    mkdirSync(path.join(basedir, 'jdk/jmods'));
    const mainRoot = path.join(basedir, 'src/main/java');
    const reportDir = path.join(basedir, 'report');
    for (const directory of [mainRoot, reportDir]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(path.join(mainRoot, 'Demo.java'), 'class Demo {}\n');
    const pmdJar = path.join(basedir, 'pmd-java-7.0.0.jar');
    writeFileSync(pmdJar, zipOf(shippedCategories()));

    runPmd({
      module: sourceModule({ basedir, sourceRoots: [mainRoot], compiler: { compilerArgs: [] } }),
      reportDir,
      tools: { pmd: [pmdJar] },
      classpaths: { mainCompile: [], testCompile: [] },
      configs: { pmd: {} },
      spring: false,
      environment: { JAVA_HOME: path.join(basedir, 'jdk'), NITPICKER_ENGINE: quietEngine(basedir) },
    });

    expect(existsSync(path.join(basedir, 'arguments.json'))).toBe(false);
    expect(readFileSync(path.join(reportDir, 'pmd.sarif'), 'utf8')).toBe(
      '{"version":"2.1.0","runs":[]}',
    );
    expect(readFileSync(path.join(reportDir, 'pmd-log.txt'), 'utf8')).toBe('');
  });
});

const XPATH = 'net.sourceforge.pmd.lang.rule.xpath.XPathRule';

function shippedCategories(): Record<string, string> {
  const rules = new Map<string, string[]>();
  const shipped = ['pmd-ruleset.xml', 'pmd-main-ruleset.xml', 'pmd-test-ruleset.xml'];
  for (const name of [...shipped, 'rules/guards-ruleset.xml']) {
    const text = readFileSync(path.join(GRADLE_DIRECTORY, name), 'utf8');
    for (const [, file = '', rule] of text.matchAll(
      /ref="(category\/[^"]+?\.xml)(?:\/([^"]+))?"/gu,
    )) {
      rules.set(file, [...(rules.get(file) ?? []), ...(rule === undefined ? [] : [rule])]);
    }
  }
  return Object.fromEntries(
    [...rules].map(([file, names]) => [
      file,
      '<ruleset name="c" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">' +
        names
          .map(
            (rule) =>
              `<rule name="${rule}" language="java" class="${XPATH}" message="${rule}">` +
              '<properties><property name="xpath"><value>//A</value></property></properties></rule>',
          )
          .join('') +
        '</ruleset>',
    ]),
  );
}

function quietEngine(basedir: string): string {
  const engine = path.join(basedir, 'engine.cjs');
  writeFileSync(
    engine,
    [
      `#!${process.execPath}`,
      "const out = process.argv[process.argv.indexOf('--out') + 1];",
      "require('node:fs').writeFileSync(out, JSON.stringify({ findings: [], syntaxErrorFiles: [] }));",
    ].join('\n'),
  );
  chmodSync(engine, 0o755);
  return engine;
}
