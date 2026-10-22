import { nitpickerCheckstyleConfig } from './configuration/checkstyle-config.mjs';
import {
  nitpickerCheckstyleConfig as gradleCheckstyleConfig,
  withGuardChecks,
} from '../builds/rulesets/checkstyle-config.mjs';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GRADLE_DIRECTORY } from '../builds/java-build.mjs';
import { javaFiles, runFormat, runPmd, writeCheckstyleSetup } from './maven-lint.mjs';
import { toolDependencies } from './maven-tools.mjs';
import { readPinnedTools } from '../builds/java-build.mjs';

const roots = [];

function dependency(groupId, artifactId, version, extra = '') {
  const id = `<groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId>`;
  return `<dependency>${id}<version>${version}</version>${extra}</dependency>`;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const nameModule = (name, format) =>
  `<module name="${name}"><property name="format" value="${format}"/></module>`;
const NAME_MODULES =
  nameModule('MemberName', '^[a-z][a-z0-9][a-zA-Z0-9]*$') +
  nameModule('MethodName', '^[a-z][a-z0-9][a-zA-Z0-9_]*$');
const RELAXED_NAME_MODULES =
  nameModule('MemberName', '^[a-z]([a-z0-9][a-zA-Z0-9]*)?$') +
  nameModule('MethodName', '^[a-z]([a-z0-9][a-zA-Z0-9]*)?$');

describe('nitpickerCheckstyleConfig', () => {
  it('drops every inline suppression filter from the bundled Google checks', () => {
    const bundled = [
      '<module name="Checker">',
      '  <module name="SuppressWarningsFilter"/>',
      '  <module name="SuppressWithNearbyCommentFilter">',
      '    <property name="commentFormat" value="x"/>',
      '  </module>',
      '  <module name="TreeWalker"><module name="SuppressWarningsHolder" /></module>',
      NAME_MODULES,
      '</module>',
    ].join('\n');

    expect(nitpickerCheckstyleConfig(bundled)).toBe(
      [
        '<module name="Checker">',
        '  ',
        '  ',
        '  <module name="TreeWalker"></module>',
        RELAXED_NAME_MODULES,
        '</module>',
      ].join('\n'),
    );
  });

  it('relaxes the member and method name patterns to the ones of the Gradle run', () => {
    expect(() => nitpickerCheckstyleConfig('<module name="Checker"/>')).toThrow(
      'nitpicker could not find MemberName in google_checks.xml',
    );
  });
});

describe('an inline Checkstyle suppression', () => {
  const INLINE_FILTERS = [
    'SuppressWarningsFilter',
    'SuppressionCommentFilter',
    'SuppressWithNearbyCommentFilter',
    'SuppressWithNearbyTextFilter',
    'SuppressWithPlainTextCommentFilter',
    'SuppressionXpathFilter',
  ];
  const bundled = [
    '<module name="Checker">',
    ...INLINE_FILTERS.map((name) => `<module name="${name}"/>`),
    '<module name="TreeWalker"><module name="SuppressWarningsHolder"/></module>',
    NAME_MODULES,
    '</module>',
  ].join('\n');
  const moduleNames = (config) =>
    [...config.matchAll(/<module name="(\w+)"/g)].map(([, name]) => name);

  it.each([
    ['Gradle', gradleCheckstyleConfig],
    ['Maven', nitpickerCheckstyleConfig],
  ])(
    'such as @SuppressWarnings("checkstyle:magicnumber") has no effect on the %s run',
    (_, checkstyleConfig) => {
      const names = moduleNames(
        withGuardChecks(checkstyleConfig(bundled), ['checkstyle-all.xml', 'checkstyle-main.xml']),
      );

      expect({
        magicNumber: names.includes('MagicNumber'),
        honored: names.filter((name) =>
          [...INLINE_FILTERS, 'SuppressWarningsHolder'].includes(name),
        ),
      }).toEqual({ magicNumber: true, honored: [] });
    },
  );
});

describe('writeCheckstyleSetup', () => {
  const checker = (max, check) =>
    `<module name="Checker"><module name="LineLength"><property name="max" value="${max}"/></module>` +
    `<module name="TreeWalker"><module name="${check}"/></module></module>`;
  const nitpickerConfig = checker(100, 'AvoidStarImport');
  const projectConfig = checker(140, 'MagicNumber');
  const suppressions = [
    'org.checkstyle.google.suppressionfilter.config',
    `${GRADLE_DIRECTORY}/checkstyle-suppressions.xml`,
  ].join('=');
  const doctype = [
    '<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"',
    '"https://checkstyle.org/dtds/configuration_1_3.dtd">',
  ].join(' ');
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n${doctype}\n`;
  const merged = (max) => `${header}<module name="Checker">
  <module name="LineLength">
    <property name="max" value="${max}"/>
  </module>
  <module name="TreeWalker">
    <module name="AvoidStarImport"/>
    <module name="MagicNumber"/>
  </module>
</module>
`;

  function projectSetup(options = {}) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-checkstyle-setup-'));
    roots.push(root);
    const project = path.join(root, 'config', 'checkstyle.xml');
    mkdirSync(path.dirname(project), { recursive: true });
    writeFileSync(project, projectConfig);
    const setup = writeCheckstyleSetup({
      directory: path.join(root, 'out'),
      nitpickerConfig,
      project,
      ...options,
    });
    return { project, setup };
  }

  it('writes only the nitpicker checks when the project has no config', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-checkstyle-setup-'));
    roots.push(root);

    const setup = writeCheckstyleSetup({ directory: path.join(root, 'out'), nitpickerConfig });

    expect(readFileSync(setup.config, 'utf8')).toBe(nitpickerConfig);
    expect(readFileSync(setup.properties, 'utf8')).toBe(suppressions);
  });

  it('points the suppression filter at the file that keeps the checks both formatters agree on', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-checkstyle-setup-'));
    roots.push(root);

    const setup = writeCheckstyleSetup({
      directory: path.join(root, 'out'),
      nitpickerConfig,
      suppressions: 'checkstyle-suppressions-unformatted.xml',
    });

    expect(readFileSync(setup.properties, 'utf8')).toBe(
      suppressions.replace(
        'checkstyle-suppressions.xml',
        'checkstyle-suppressions-unformatted.xml',
      ),
    );
  });

  it('lays the project config over the nitpicker checks and points config_loc at it', () => {
    const { project, setup } = projectSetup({ projectWins: true });

    expect(readFileSync(setup.config, 'utf8')).toBe(merged(140));
    expect(readFileSync(setup.properties, 'utf8')).toBe(
      `config_loc=${path.dirname(project)}\n${suppressions}`,
    );
  });

  it('keeps the values nitpicker sets when nitpicker is listed first', () => {
    const { setup } = projectSetup({ projectWins: false });

    expect(readFileSync(setup.config, 'utf8')).toBe(merged(100));
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

    expect(tools.pit).toEqual([dependency('org.pitest', 'pitest-command-line', pinned.pitest)]);
    expect(tools['pit-junit5']).toEqual([
      dependency(
        'org.pitest',
        'pitest-junit5-plugin',
        pinned.pitestJunit5,
        `<exclusions>${exclusions}</exclusions>`,
      ),
    ]);
    expect(tools['pit-testng']).toEqual([
      dependency('org.pitest', 'pitest-testng-plugin', pinned.pitestTestng),
    ]);
    expect(tools['launcher-1.11.4']).toEqual([
      dependency('org.junit.platform', 'junit-platform-launcher', '1.11.4'),
    ]);
    expect(tools.jacoco).toEqual([
      dependency('org.jacoco', 'org.jacoco.cli', pinned.jacoco, '<classifier>nodeps</classifier>'),
    ]);
  });
});

describe('runFormat', () => {
  function formatTokens(javaStyle, keep) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-format-'));
    roots.push(root);
    const java = path.join(root, 'jdk/bin/java');
    mkdirSync(path.dirname(java), { recursive: true });
    writeFileSync(java, '#!/bin/sh\ncat "${1#@}"\n');
    chmodSync(java, 0o755);
    vi.stubEnv('JAVA_HOME', path.join(root, 'jdk'));
    const source = path.join(root, 'src/main/java/demo/A.java');
    mkdirSync(path.dirname(source), { recursive: true });
    writeFileSync(source, 'package demo;\n\nclass A {\n    int a;\n}\n');
    const reportDir = path.join(root, 'report');
    mkdirSync(reportDir);
    const module = { basedir: root, sourceRoots: [path.dirname(source)], testSourceRoots: [] };
    const tools = { format: ['google.jar'], 'format-palantir': ['palantir.jar'] };
    runFormat({ module, reportDir, tools, javaStyle });
    return readFileSync(path.join(reportDir, 'format.txt'), 'utf8').split('\n').filter(keep);
  }

  function formatArguments(javaStyle) {
    return formatTokens(
      javaStyle,
      (token) => token.startsWith('"--') && !token.startsWith('"--add-exports'),
    );
  }

  it('runs google-java-format with --aosp for the 4-space style and without it otherwise', () => {
    expect(formatArguments('aosp')).toEqual(['"--aosp"', '"--dry-run"']);
    expect(formatArguments('google')).toEqual(['"--dry-run"']);
    expect(formatArguments(undefined)).toEqual(['"--dry-run"']);
  });

  it('runs palantir-java-format from its own jar, and nothing when no formatter runs', () => {
    const run = (style) =>
      formatTokens(style, (token) => /^"--(?:palantir|dry-run)"$|\.jar|\.Main"/.test(token));

    expect(run('palantir')).toEqual([
      '"palantir.jar"',
      '"com.palantir.javaformat.java.Main"',
      '"--palantir"',
      '"--dry-run"',
    ]);
    expect(run('google')).toEqual([
      '"google.jar"',
      '"com.google.googlejavaformat.java.Main"',
      '"--dry-run"',
    ]);
    expect(run('none')).toEqual([]);
  });
});

describe.skipIf(process.platform === 'win32')('runPmd', () => {
  function pmdRun(spring) {
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
    const module = {
      basedir,
      sourceRoots: [mainRoot],
      testSourceRoots: [testRoot],
      compiler: { compilerArgs: [] },
    };
    const classpaths = { mainCompile: [], testCompile: [] };
    runPmd({
      module,
      reportDir,
      tools: { pmd: ['pmd.jar'] },
      classpaths,
      configs: { pmd: {} },
      spring,
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

  it('adds the Spring rule sets to the main-only and test-only wrappers of a Spring module', () => {
    const run = pmdRun(true);

    expect(run.rulesets.slice(0, 3)).toEqual([
      shipped('pmd-ruleset.xml'),
      path.join(run.reportDir, 'pmd-tests.xml'),
      path.join(run.reportDir, 'pmd-main.xml'),
    ]);
    expect(run.rulesets.slice(3).every((file) => path.dirname(file) === run.reportDir)).toBe(true);
    expect(run.mainRules).toEqual([shipped('pmd-main-ruleset.xml'), shipped('spring-ruleset.xml')]);
    expect(run.testRules).toEqual([
      shipped('pmd-test-ruleset.xml'),
      shipped('spring-test-ruleset.xml'),
    ]);
  });

  it('leaves the Spring rule sets out of a module without Spring', () => {
    const run = pmdRun(false);

    expect({ main: run.mainRules, tests: run.testRules }).toEqual({
      main: [shipped('pmd-main-ruleset.xml')],
      tests: [shipped('pmd-test-ruleset.xml')],
    });
  });
});
