import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { javaFiles, nitpickerCheckstyleConfig, spotbugsLaunch } from './maven-lint.mjs';
import { toolDependencies } from './maven-tools.mjs';
import { INIT_SCRIPT, readPinnedTools } from '../builds/java-build.mjs';

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
    expect(tools.spotbugsPlugins).toEqual([
      dependency('com.h3xstream.findsecbugs', 'findsecbugs-plugin', pinned.findSecBugs),
    ]);
    expect(tools.jacoco).toEqual([
      dependency('org.jacoco', 'org.jacoco.cli', pinned.jacoco, '<classifier>nodeps</classifier>'),
    ]);
  });
});

describe('spotbugsLaunch', () => {
  const module = { sourceRoots: ['/missing/src'], outputDirectory: '/work/classes' };
  const launch = spotbugsLaunch({
    module,
    report: '/work/spotbugs.sarif',
    tools: { spotbugsPlugins: ['/m2/plugin.jar', '/m2/extra.jar'] },
  });

  it('loads find-sec-bugs with its exclusion filter, as the Gradle run does', () => {
    const argument = (name) => launch.args[launch.args.indexOf(name) + 1];

    expect(argument('-pluginList')).toBe(['/m2/plugin.jar', '/m2/extra.jar'].join(path.delimiter));
    expect(argument('-exclude')).toMatch(/gradle[/\\]security[/\\]exclude\.xml$/u);
    expect(launch.args.at(-1)).toBe('/work/classes');
  });

  it('gives the plugin the same sink files and types as the Gradle init script', () => {
    const init = readFileSync(INIT_SCRIPT, 'utf8');
    const gradleFiles = [
      ...init.matchAll(/security\/([\w-]+-sinks\.txt)'\)\.absolutePath\}\|(\w+)/gu),
    ]
      .map(([, file, type]) => `${file}|${type}`)
      .sort();
    const mavenFiles = launch.jvmArgs
      .flatMap((argument) => argument.split('=')[1].split(path.delimiter))
      .map((entry) => `${path.basename(entry.split('|')[0])}|${entry.split('|')[1]}`)
      .sort();

    expect(mavenFiles).toEqual(gradleFiles);
    expect(launch.jvmArgs.map((argument) => argument.split('=')[0])).toEqual([
      '-Dfindsecbugs.injection.customconfigfile.SqlInjectionDetector',
      '-Dfindsecbugs.injection.customconfigfile.PathTraversalDetector',
    ]);
  });
});
