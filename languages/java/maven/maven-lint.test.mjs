import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { escapeRegExp } from '../../../shared/glob.mjs';
import { javaFiles, nitpickerCheckstyleConfig, runPmd } from './maven-lint.mjs';
import { toolDependencies } from './maven-tools.mjs';
import { GRADLE_DIRECTORY, readPinnedTools } from '../builds/java-build.mjs';

const roots = [];

function dependency(groupId, artifactId, version, extra = '') {
  const id = `<groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId>`;
  return `<dependency>${id}<version>${version}</version>${extra}</dependency>`;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('nitpickerCheckstyleConfig', () => {
  it('drops every inline suppression filter from the bundled Google checks', () => {
    const bundled = [
      '<module name="Checker">',
      '  <module name="SuppressWarningsFilter"/>',
      '  <module name="SuppressWithNearbyCommentFilter">',
      '    <property name="commentFormat" value="x"/>',
      '  </module>',
      '  <module name="TreeWalker"><module name="SuppressWarningsHolder" /></module>',
      '</module>',
    ].join('\n');

    expect(nitpickerCheckstyleConfig(bundled)).toBe(
      [
        '<module name="Checker">',
        '  ',
        '  ',
        '  <module name="TreeWalker"></module>',
        '</module>',
      ].join('\n'),
    );
  });
});

describe('javaFiles', () => {
  it('lists the Java files under existing roots, sorted', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-files-'));
    roots.push(root);
    for (const file of ['b/B.java', 'a/A.java', 'a/notes.txt', 'a/deep/C.java']) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), '');
    }

    expect(
      javaFiles([path.join(root, 'b'), path.join(root, 'a'), path.join(root, 'missing')]),
    ).toEqual(['a/A.java', 'a/deep/C.java', 'b/B.java'].map((file) => path.join(root, file)));
  });
});

describe('maven tools', () => {
  it('keeps the project JUnit Platform for PIT and adds a launcher per missing version', () => {
    const pinned = readPinnedTools();
    const exclusions = [
      'org.junit.platform',
      'org.junit.jupiter',
      'org.opentest4j',
      'org.apiguardian',
    ]
      .map(
        (group) => `<exclusion><groupId>${group}</groupId><artifactId>*</artifactId></exclusion>`,
      )
      .join('');

    const tools = toolDependencies(pinned, ['1.11.4']);

    expect(tools.pit).toEqual([
      dependency('org.pitest', 'pitest-command-line', pinned.pitest),
      dependency(
        'org.pitest',
        'pitest-junit5-plugin',
        pinned.pitestJunit5,
        `<exclusions>${exclusions}</exclusions>`,
      ),
    ]);
    expect(tools['launcher-1.11.4']).toEqual([
      dependency('org.junit.platform', 'junit-platform-launcher', '1.11.4'),
    ]);
    expect(tools.jacoco).toEqual([
      dependency('org.jacoco', 'org.jacoco.cli', pinned.jacoco, '<classifier>nodeps</classifier>'),
    ]);
  });
});

describe.skipIf(process.platform === 'win32')('runPmd', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function temporary(prefix) {
    const root = mkdtempSync(path.join(tmpdir(), prefix));
    roots.push(root);
    return root;
  }

  function fakeJavaHome() {
    const home = temporary('nitpicker-fake-java-');
    const java = path.join(home, 'bin', 'java');
    mkdirSync(path.dirname(java));
    writeFileSync(
      java,
      [
        `#!${process.execPath}`,
        "const fs = require('node:fs');",
        "const lines = fs.readFileSync(process.argv[2].slice(1), 'utf8').split('\\n');",
        'const args = lines.map((line) => JSON.parse(line));',
        `fs.writeFileSync(${JSON.stringify(path.join(home, 'arguments.json'))}, JSON.stringify(args));`,
        "fs.writeFileSync(args[args.indexOf('--report-file') + 1], '{}');",
      ].join('\n'),
    );
    chmodSync(java, 0o755);
    vi.stubEnv('JAVA_HOME', home);
    return home;
  }

  function pmdRulesets(mainCompile) {
    const basedir = temporary('nitpicker-pmd-module-');
    const mainRoot = path.join(basedir, 'src/main/java');
    const testRoot = path.join(basedir, 'src/test/java');
    const reportDir = path.join(basedir, 'target/nitpicker');
    for (const directory of [mainRoot, testRoot, reportDir]) {
      mkdirSync(directory, { recursive: true });
    }
    const javaHome = fakeJavaHome();
    runPmd({
      module: {
        basedir,
        sourceRoots: [mainRoot],
        testSourceRoots: [testRoot],
        outputDirectory: path.join(basedir, 'target/classes'),
        testOutputDirectory: path.join(basedir, 'target/test-classes'),
      },
      reportDir,
      tools: { pmd: ['pmd.jar'] },
      classpaths: { mainCompile, testCompile: [] },
      configs: { pmd: { nitpicker: true } },
    });
    const args = JSON.parse(readFileSync(path.join(javaHome, 'arguments.json'), 'utf8'));
    return {
      rulesets: args[args.indexOf('--rulesets') + 1].split(','),
      dirs: args[args.indexOf('--dir') + 1].split(','),
      springRuleset: path.join(reportDir, 'pmd-spring-main.xml'),
      mainRoot,
      testRoot,
    };
  }

  const nitpickerRuleset = path.join(GRADLE_DIRECTORY, 'pmd-ruleset.xml');

  it.each([['spring-context-6.1.14.jar'], ['spring-boot-3.3.5.jar']])(
    'adds the Spring ruleset, without the test roots, when %s is on the main compile classpath',
    (jar) => {
      const run = pmdRulesets(['/m2/guava-33.3.1-jre.jar', `/m2/${jar}`]);

      expect(run.rulesets).toEqual([nitpickerRuleset, run.springRuleset]);
      expect(run.dirs).toEqual([run.mainRoot, run.testRoot]);
      expect(readFileSync(run.springRuleset, 'utf8')).toBe(
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<ruleset name="nitpicker-spring-main" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">',
          "  <description>Nitpicker's Spring rules on main sources only.</description>",
          `  <exclude-pattern>${escapeRegExp(run.testRoot + path.sep)}.*</exclude-pattern>`,
          `  <rule ref="${path.join(GRADLE_DIRECTORY, 'spring-ruleset.xml')}"/>`,
          '</ruleset>',
          '',
        ].join('\n'),
      );
    },
  );

  it.each([[['/m2/spring-core-6.1.14.jar', '/m2/spring-web-6.1.14.jar']], [[]]])(
    'leaves the Spring ruleset out without spring-context or spring-boot on the main classpath: %j',
    (mainCompile) => {
      expect(pmdRulesets(mainCompile).rulesets).toEqual([nitpickerRuleset]);
    },
  );
});
