import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseXml } from '../../../../shared/ingest/common.mjs';
import { jdkRequirements, toolchainJdkHome } from './toolchain-jdk.mjs';

const homes = [];

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

    expect(toolchainJdkHome({ version: '17', vendor: 'temurin' }, { home })).toBe('/jdks/17');
    expect(toolchainJdkHome({ version: '17' }, { home })).toBe('/jdks/zulu17');
  });

  it('matches a version range', () => {
    const home = userHome(
      entry('11', 'a', '/jdks/11') + entry('17', 'a', '/jdks/17') + entry('21', 'a', '/jdks/21'),
    );

    expect(toolchainJdkHome({ version: '[17,21)' }, { home })).toBe('/jdks/17');
    expect(toolchainJdkHome({ version: '[18,)' }, { home })).toBe('/jdks/21');
    expect(toolchainJdkHome({ version: '(,11]' }, { home })).toBe('/jdks/11');
  });

  it('fails loudly when no toolchain provides the JDK', () => {
    const home = userHome(entry('11', 'temurin', '/jdks/11'));

    expect(() => toolchainJdkHome({ version: '17' }, { home })).toThrow(
      new Error(
        `The build selects the JDK toolchain {"version":"17"}, and ${path.join(home, '.m2', 'toolchains.xml')} lists no JDK that provides it`,
      ),
    );
  });
});
