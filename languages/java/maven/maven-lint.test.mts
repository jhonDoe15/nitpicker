import { nitpickerCheckstyleConfig } from '../builds/rulesets/checkstyle-config.mts';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  nestedCheckout,
  useGitCheckouts,
} from '../../../core/diff/git/test-support/git-checkout.mts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GRADLE_DIRECTORY } from '../builds/java-build.mts';
import { runFormat } from './format/maven-format.mts';
import { javaFiles, writeCheckstyleSetup } from './maven-lint.mts';
import { toolDependencies } from './maven-tools.mts';
import { readPinnedTools } from '../builds/java-build.mts';

const roots: string[] = [];
const { gitCheckout } = useGitCheckouts();

function dependency(
  groupId: string,
  artifactId: string,
  version: string | undefined,
  extra = '',
): string {
  const id = `<groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId>`;
  return `<dependency>${id}<version>${String(version)}</version>${extra}</dependency>`;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const GOOGLE_CHECKS_13 = [
  '<module name="Checker">',
  '  <module name="SuppressWarningsFilter"/>',
  '  <module name="SuppressWithNearbyCommentFilter">',
  '    <property name="commentFormat" value="x"/>',
  '  </module>',
  '  <module name="TreeWalker"><module name="SuppressWarningsHolder" />',
  '    <module name="TextBlockGoogleStyleFormatting"/>',
  '    <module name="GoogleNonConstantFieldName"/>',
  '    <module name="MethodName">',
  '      <property name="format"',
  '          value="^(?![a-z]$)[a-z][a-z0-9]*$"/>',
  '    </module>',
  '    <module name="TodoComment">',
  '      <property name="id" value="TodoFormat"/>',
  '      <property name="format" value="^TODO:"/>',
  '    </module>',
  '  </module>',
  '</module>',
].join('\n');

describe('nitpickerCheckstyleConfig', () => {
  const config = nitpickerCheckstyleConfig(GOOGLE_CHECKS_13);

  it('drops every inline suppression filter and the text block check google-java-format contradicts', () => {
    expect(
      [
        'SuppressWarningsFilter',
        'SuppressWithNearbyCommentFilter',
        'SuppressWarningsHolder',
        'TextBlockGoogleStyleFormatting',
      ].filter((name) => config.includes(`"${name}"`)),
    ).toEqual([]);
  });

  it('allows one-letter fields and methods, and an untagged TODO in any case but the tag itself', () => {
    const count = (text: string): number => config.split(text).length - 1;

    expect([
      count('value="^[a-z]([a-z0-9][a-zA-Z0-9]*)?$"/>'),
      count(`<property name="query" value="//VARIABLE_DEF/IDENT[matches(@text, '^[a-z]$')]"/>`),
      count('<property name="format" value="^[ \\t]*(?!TODO\\b)(?i:TODO)\\b"/>'),
    ]).toEqual([1, 1, 1]);
    expect(config).not.toContain('^TODO:');
  });

  it('keeps rejecting an underscore between digits in field names', () => {
    expect(
      ['MemberName', 'StaticVariableName'].map((check) =>
        config.includes(
          `<module name="${check}"><property name="id" value="GoogleNonConstantFieldName"/>`,
        ),
      ),
    ).toEqual([true, true]);
  });

  it('names the module it cannot find', () => {
    expect(() => nitpickerCheckstyleConfig('<module name="Checker"/>')).toThrow(
      'nitpicker could not find MethodName in google_checks.xml',
    );
  });
});

describe('writeCheckstyleSetup', () => {
  const checker = (max: number, check: string): string =>
    `<module name="Checker"><module name="LineLength"><property name="max" value="${String(max)}"/></module>` +
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
  const merged = (max: number): string => `${header}<module name="Checker">
  <module name="LineLength">
    <property name="max" value="${String(max)}"/>
  </module>
  <module name="TreeWalker">
    <module name="AvoidStarImport"/>
    <module name="MagicNumber"/>
  </module>
</module>
`;

  function projectSetup(options: { projectWins: boolean }) {
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

    const setup = writeCheckstyleSetup({
      directory: path.join(root, 'out'),
      nitpickerConfig,
      projectWins: false,
    });

    expect(readFileSync(setup.config, 'utf8')).toBe(nitpickerConfig);
    expect(readFileSync(setup.properties, 'utf8')).toBe(suppressions);
  });

  it('points the suppression filter at the file that keeps the checks both formatters agree on', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-checkstyle-setup-'));
    roots.push(root);

    const setup = writeCheckstyleSetup({
      directory: path.join(root, 'out'),
      nitpickerConfig,
      projectWins: false,
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

    expect(tools['pit']).toEqual([
      dependency('org.pitest', 'pitest-command-line', pinned['pitest']),
    ]);
    expect(tools['pit-junit5']).toEqual([
      dependency(
        'org.pitest',
        'pitest-junit5-plugin',
        pinned['pitestJunit5'],
        `<exclusions>${exclusions}</exclusions>`,
      ),
    ]);
    expect(tools['pit-testng']).toEqual([
      dependency('org.pitest', 'pitest-testng-plugin', pinned['pitestTestng']),
    ]);
    expect(tools['launcher-1.11.4']).toEqual([
      dependency('org.junit.platform', 'junit-platform-launcher', '1.11.4'),
    ]);
    expect(tools['jacoco']).toEqual([
      dependency(
        'org.jacoco',
        'org.jacoco.cli',
        pinned['jacoco'],
        '<classifier>nodeps</classifier>',
      ),
    ]);
  });
});

describe('runFormat', () => {
  function formatTokens(
    javaStyle: string | undefined,
    keep: (token: string) => boolean,
    formatterFlags?: readonly string[],
  ): string[] {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-format-'));
    roots.push(root);
    const java = path.join(root, 'jdk/bin/java');
    mkdirSync(path.dirname(java), { recursive: true });
    writeFileSync(
      java,
      `#!/bin/sh\n[ "$1" = -version ] && echo 'openjdk version "21.0.1"' >&2 && exit 0\ncat "\${1#@}"\n`,
    );
    chmodSync(java, 0o755);
    vi.stubEnv('JAVA_HOME', path.join(root, 'jdk'));
    const source = path.join(root, 'src/main/java/demo/A.java');
    mkdirSync(path.dirname(source), { recursive: true });
    writeFileSync(source, 'package demo;\n\nclass A {\n    int a;\n}\n');
    const reportDir = path.join(root, 'report');
    mkdirSync(reportDir);
    const module = { basedir: root, sourceRoots: [path.dirname(source)], testSourceRoots: [] };
    const tools = { format: ['google.jar'], 'format-palantir': ['palantir.jar'] };
    runFormat({ module, reportDir, tools, javaStyle, formatterFlags });
    return readFileSync(path.join(reportDir, 'format.txt'), 'utf8').split('\n').filter(keep);
  }

  function formatArguments(javaStyle: string | undefined): string[] {
    return formatTokens(
      javaStyle,
      (token: string) => token.startsWith('"--') && !token.startsWith('"--add-exports'),
    );
  }

  it('runs google-java-format with --aosp for the 4-space style and without it otherwise', () => {
    expect(formatArguments('aosp')).toEqual(['"--aosp"', '"--dry-run"']);
    expect(formatArguments('google')).toEqual(['"--dry-run"']);
    expect(formatArguments(undefined)).toEqual(['"--dry-run"']);
  });

  it('passes the formatter options the build file declares, before the files', () => {
    expect(
      formatTokens(
        'google',
        (token: string) => token.startsWith('"--') && !token.startsWith('"--add-exports'),
        ['--skip-javadoc-formatting', '--skip-reflowing-long-strings'],
      ),
    ).toEqual(['"--skip-javadoc-formatting"', '"--skip-reflowing-long-strings"', '"--dry-run"']);
  });

  it('runs palantir-java-format from its own jar, and nothing when no formatter runs', () => {
    const run = (style: string): string[] =>
      formatTokens(style, (token: string) =>
        /^"--(?:palantir|dry-run)"$|\.jar|\.Main"/.test(token),
      );

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

describe('javaFiles in a Git checkout', () => {
  it('lists the files of the checkout, not ignored folders or nested checkouts', () => {
    const root = gitCheckout(
      {
        'src/A.java': '',
        'src/gen/G.java': '',
        ...nestedCheckout('src/agent', { 'X.java': '' }),
      },
      ['src/gen/'],
    );

    expect(javaFiles([path.join(root, 'src')])).toEqual([path.join(root, 'src/A.java')]);
    expect(javaFiles([path.join(root, 'src/gen')])).toEqual([]);
  });
});
