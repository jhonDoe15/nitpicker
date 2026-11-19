import {
  chmodSync,
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
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { runPmd } from '../maven-lint.mts';

const roots = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === 'win32')('runPmd', () => {
  function pmdRun(spring, springRules, reactor = false, mainCompile = []) {
    const basedir = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-pmd-'));
    roots.push(basedir);
    const java = path.join(basedir, 'jdk/bin/java');
    mkdirSync(path.dirname(java), { recursive: true });
    writeFileSync(
      java,
      [
        `#!${process.execPath}`,
        "const fs = require('node:fs');",
        "const lines = fs.readFileSync(process.argv[2].slice(1), 'utf8').split('\\n');",
        'const args = lines.map((line) => JSON.parse(line));',
        `fs.writeFileSync(${JSON.stringify(path.join(basedir, 'arguments.json'))}, JSON.stringify(args));`,
        "fs.writeFileSync(args[args.indexOf('--report-file') + 1], '{}');",
      ].join('\n'),
    );
    chmodSync(java, 0o755);
    vi.stubEnv('JAVA_HOME', path.join(basedir, 'jdk'));
    const [mainRoot, testRoot, reportDir] = ['src/main/java', 'src/test/java', 'report'].map(
      (name) => path.join(basedir, name),
    );
    for (const directory of [mainRoot, testRoot, reportDir]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(path.join(mainRoot, 'Demo.java'), 'class Demo {}\n');
    const module = {
      basedir,
      sourceRoots: [mainRoot],
      testSourceRoots: [testRoot],
      compiler: { compilerArgs: [] },
    };
    const classpaths = { mainCompile, testCompile: [] };
    runPmd({
      module,
      reportDir,
      tools: { pmd: ['pmd.jar'] },
      classpaths,
      configs: { pmd: {} },
      spring,
      springRules,
      reactor,
    });
    const args = JSON.parse(readFileSync(path.join(basedir, 'arguments.json'), 'utf8'));
    const refs = (name) =>
      [...readFileSync(path.join(reportDir, name), 'utf8').matchAll(/<rule ref="([^"]+)"/g)].map(
        ([, ref]) => ref,
      );
    return {
      rulesets: args[args.indexOf('--rulesets') + 1].split(','),
      mainRules: refs('pmd-main.xml'),
      testRules: refs('pmd-tests.xml'),
      reportDir,
    };
  }

  const shipped = (name) => path.join(GRADLE_DIRECTORY, name);
  const mainWrapper = (run, ...rules) =>
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
    const run = pmdRun(true, undefined, false, ['/m2/spring-context-6.1.0.jar']);

    expect(run.rulesets.slice(0, 3)).toEqual([
      shipped('pmd-ruleset.xml'),
      path.join(run.reportDir, 'pmd-tests.xml'),
      path.join(run.reportDir, 'pmd-main.xml'),
    ]);
    expect(run.rulesets.slice(3).every((file) => path.dirname(file) === run.reportDir)).toBe(true);
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
    const run = pmdRun(true, undefined, false, ['/m2/spring-data-jpa-3.3.0.jar']);

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
    const run = pmdRun(false, undefined, true);

    expect(run.mainRules).toEqual([
      shipped('pmd-main-ruleset.xml'),
      shipped('reactor-ruleset.xml'),
    ]);
    expect(run.testRules).toEqual([shipped('pmd-test-ruleset.xml')]);
  });

  it('takes the Spring rule set written for the project when it names annotations of its own', () => {
    const own = path.join(tmpdir(), 'spring-ruleset-project.xml');

    expect(pmdRun(true, own).mainRules.at(-1)).toBe(own);
    expect(pmdRun(false, own).mainRules).toEqual([shipped('pmd-main-ruleset.xml')]);
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
      module: { basedir, sourceRoots: [mainRoot], testSourceRoots: [] },
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
});
