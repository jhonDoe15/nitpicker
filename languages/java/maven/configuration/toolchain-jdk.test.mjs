import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseXml } from '../../../../shared/ingest/common.mjs';
import { jdkRequirements, toolchainJdkHome } from './toolchain-jdk.mjs';

const homes = [];

function contextOf(home) {
  return { projectRoot: '/nowhere', environment: {}, home, maven: '/nonexistent/mvn' };
}

function mavenProject(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-toolchains-project-'));
  homes.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function entry(version, vendor, jdkHome) {
  return `<toolchain><type>jdk</type><provides><version>${version}</version><vendor>${vendor}</vendor></provides>
    <configuration><jdkHome>${jdkHome}</jdkHome></configuration></toolchain>`;
}

function userHome(toolchains) {
  const home = mkdtempSync(path.join(tmpdir(), 'nitpicker-toolchains-'));
  homes.push(home);
  mkdirSync(path.join(home, '.m2'));
  writeFileSync(path.join(home, '.m2', 'toolchains.xml'), `<toolchains>${toolchains}</toolchains>`);
  return home;
}

function project(build) {
  return parseXml(`<project><build><plugins>${build}</plugins></build></project>`);
}

afterEach(() => {
  for (const home of homes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

describe('the JDK the build selects', () => {
  it('reads the requirement of the toolchains plugin, of its execution or of the compiler plugin', () => {
    const toolchains = (configuration) =>
      `<plugin><artifactId>maven-toolchains-plugin</artifactId>${configuration}</plugin>`;
    const jdk = '<toolchains><jdk><version>17</version><vendor>temurin</vendor></jdk></toolchains>';

    expect(jdkRequirements(project(toolchains(`<configuration>${jdk}</configuration>`)))).toEqual({
      version: '17',
      vendor: 'temurin',
    });
    expect(
      jdkRequirements(
        project(
          toolchains(
            `<executions><execution><configuration>${jdk}</configuration></execution></executions>`,
          ),
        ),
      ),
    ).toEqual({ version: '17', vendor: 'temurin' });
    expect(
      jdkRequirements(
        project(
          '<plugin><artifactId>maven-compiler-plugin</artifactId><configuration><jdkToolchain><version>21</version></jdkToolchain></configuration></plugin>',
        ),
      ),
    ).toEqual({ version: '21' });
    expect(jdkRequirements(project(''))).toBeUndefined();
  });

  it('picks the JDK of ~/.m2/toolchains.xml that provides every required value', () => {
    const home = userHome(
      entry('11', 'temurin', '/jdks/11') +
        entry('17', 'zulu', '/jdks/zulu17') +
        entry('17', 'temurin', '/jdks/17'),
    );
    const context = contextOf(home);

    expect(toolchainJdkHome({ version: '17', vendor: 'temurin' }, context)).toBe('/jdks/17');
    expect(toolchainJdkHome({ version: '17' }, context)).toBe('/jdks/zulu17');
  });

  it('matches a version range', () => {
    const home = userHome(
      entry('11', 'a', '/jdks/11') + entry('17', 'a', '/jdks/17') + entry('21', 'a', '/jdks/21'),
    );
    const context = contextOf(home);

    expect(toolchainJdkHome({ version: '[17,21)' }, context)).toBe('/jdks/17');
    expect(toolchainJdkHome({ version: '[18,)' }, context)).toBe('/jdks/21');
    expect(toolchainJdkHome({ version: '(,11]' }, context)).toBe('/jdks/11');
  });

  it('finds no JDK when no toolchains file provides it', () => {
    const home = userHome(entry('11', 'temurin', '/jdks/11'));

    expect(toolchainJdkHome({ version: '17' }, contextOf(home))).toBeUndefined();
  });

  it.each([
    ['-t', ['-t', 'custom.xml']],
    ['--toolchains', ['--toolchains', 'custom.xml']],
    ['--toolchains=', ['--toolchains=custom.xml']],
  ])('reads the file named by %s in .mvn/maven.config, relative to the project', (_, words) => {
    const home = userHome(entry('17', 'a', '/jdks/home'));
    const projectRoot = mavenProject({
      'custom.xml': `<toolchains>${entry('17', 'a', '/jdks/custom')}</toolchains>`,
      '.mvn/maven.config': `${words.join('\n')}\n`,
    });

    expect(toolchainJdkHome({ version: '17' }, { ...contextOf(home), projectRoot })).toBe(
      '/jdks/custom',
    );
  });

  it('reads the file named by MAVEN_ARGS and the global file', () => {
    const home = userHome(entry('11', 'a', '/jdks/11'));
    const projectRoot = mavenProject({
      'user.xml': `<toolchains>${entry('17', 'a', '/jdks/user')}</toolchains>`,
      'global.xml': `<toolchains>${entry('21', 'a', '/jdks/global')}</toolchains>`,
    });
    const context = {
      ...contextOf(home),
      projectRoot,
      environment: { MAVEN_ARGS: '-t user.xml --global-toolchains global.xml' },
    };

    expect(toolchainJdkHome({ version: '17' }, context)).toBe('/jdks/user');
    expect(toolchainJdkHome({ version: '21' }, context)).toBe('/jdks/global');
  });

  it('expands environment variables and the user home in a jdkHome', () => {
    const home = userHome(
      entry('17', 'a', '${env.CUSTOM_JDK}/x') + entry('21', 'a', '${user.home}/jdk'),
    );
    const context = { ...contextOf(home), environment: { CUSTOM_JDK: '/opt' } };

    expect(toolchainJdkHome({ version: '17' }, context)).toBe('/opt/x');
    expect(toolchainJdkHome({ version: '21' }, context)).toBe(`${home}/jdk`);
  });

  it('reads ${maven.home}/conf/toolchains.xml of the Maven that runs the build', () => {
    const home = userHome(entry('11', 'a', '/jdks/11'));
    const mavenHome = mavenProject({
      'conf/toolchains.xml': `<toolchains>${entry('17', 'a', '/jdks/conf')}</toolchains>`,
    });
    const fake = path.join(mavenHome, 'mvn');
    writeFileSync(fake, `#!/bin/sh\necho "Maven home: ${mavenHome}"\n`, { mode: 0o755 });

    expect(
      toolchainJdkHome(
        { version: '17' },
        { ...contextOf(home), projectRoot: mavenHome, maven: fake },
      ),
    ).toBe('/jdks/conf');
  });
});
