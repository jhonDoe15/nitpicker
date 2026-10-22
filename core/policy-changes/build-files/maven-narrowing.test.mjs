import { describe, expect, it } from 'vitest';
import { between } from './test-support/policy-fixtures.mjs';

const CLASS = 'package a;\nclass A {}\n';
const SOURCES = {
  'src/main/java/a/A.java': CLASS,
  'src/test/java/a/slow/SlowTest.java': CLASS,
  'src/test/java/a/FastTest.java': CLASS,
  'src/test/java/a/OrderIT.java': CLASS,
};
const pom = (inner = '', build = '') =>
  `<project><modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>a</artifactId><version>1</version>${inner}<build>${build}</build></project>`;
const files = (text) => ({ 'pom.xml': text, ...SOURCES });
const plugin = (artifact, configuration) =>
  `<plugins><plugin><artifactId>${artifact}</artifactId><configuration>${configuration}</configuration></plugin></plugins>`;
const surefire = (configuration) => plugin('maven-surefire-plugin', configuration);
const failsafe = (configuration) => plugin('maven-failsafe-plugin', configuration);
const profile = (activation, body) =>
  `<profiles><profile><id>p</id>${activation}${body}</profile></profiles>`;
const ACTIVE = '<activation><activeByDefault>true</activeByDefault></activation>';
const loosenedBy = (head) => between({ base: files(pom()), head: files(head) }).policyLoosenings;

describe('Maven settings that nitpicker does not run', () => {
  it.each([
    [
      'a skipTests property in a build without Failsafe',
      pom('<properties><skipTests>true</skipTests></properties>'),
    ],
    [
      'a maven.test.skip property',
      pom('<properties><maven.test.skip>true</maven.test.skip></properties>'),
    ],
    [
      'a skipITs property in an active profile of a build without Failsafe',
      pom(profile(ACTIVE, '<properties><skipITs>true</skipITs></properties>')),
    ],
    [
      'a surefire exclude in a profile that is not active',
      pom(
        profile(
          '',
          `<build>${surefire('<excludes><exclude>**/slow/**</exclude></excludes>')}</build>`,
        ),
      ),
    ],
    [
      'a failsafe exclude of tests that surefire still runs',
      pom('', failsafe('<excludes><exclude>**/slow/**</exclude></excludes>')),
    ],
  ])('ignores %s', (_, head) => {
    expect(loosenedBy(head)).toEqual([]);
  });
});

describe('Maven settings that leave checked code out', () => {
  it('counts a failsafe exclude, or a skipITs or skipTests property, against integration tests', () => {
    const bound = failsafe('');
    const skipping = (name) => pom(`<properties><${name}>true</${name}></properties>`, bound);

    expect(
      loosenedBy(pom('', failsafe('<excludes><exclude>**/*IT.java</exclude></excludes>'))),
    ).toEqual(['Maven test excludes in pom.xml added: **/*IT.java']);
    expect(loosenedBy(skipping('skipITs'))).toEqual([
      'Maven test excludes in pom.xml added: skipITs = true',
    ]);
    expect(
      between({ base: files(pom('', bound)), head: files(skipping('skipTests')) }).policyLoosenings,
    ).toEqual(['Maven test excludes in pom.xml added: skipTests = true']);
  });

  it('counts a testSourceDirectory that an active profile moves', () => {
    const head = pom(
      profile(ACTIVE, '<build><testSourceDirectory>src/it/java</testSourceDirectory></build>'),
    );

    expect(loosenedBy(head)).toEqual([
      'Maven test source directories in pom.xml no longer includes checked code: src/test/java/a/FastTest.java, src/test/java/a/OrderIT.java, src/test/java/a/slow/SlowTest.java',
    ]);
  });

  it.each([
    [
      'includes',
      '<includes><include>**/FastTest.java</include></includes>',
      'src/test/java/a/slow/SlowTest.java',
    ],
    ['test', '<test>FastTest</test>', 'src/test/java/a/slow/SlowTest.java'],
    [
      'groups',
      '<groups>fast</groups>',
      'src/test/java/a/FastTest.java, src/test/java/a/slow/SlowTest.java',
    ],
  ])('counts surefire %s that leave a test out', (_, configuration, lost) => {
    expect(loosenedBy(pom('', surefire(configuration)))).toEqual([
      `Maven test includes in pom.xml leave out checked code: ${lost}`,
    ]);
  });

  it('counts compiler includes against main code only', () => {
    const head = pom(
      '',
      plugin('maven-compiler-plugin', '<includes><include>b/**</include></includes>'),
    );

    expect(loosenedBy(head)).toEqual([
      'Maven compiler includes in pom.xml leave out checked code: src/main/java/a/A.java',
    ]);
  });

  it('keeps an include that still admits every test', () => {
    expect(
      loosenedBy(pom('', surefire('<includes><include>**/*Test.java</include></includes>'))),
    ).toEqual([]);
  });

  it('counts an exclude in parent pluginManagement against the module roots under it', () => {
    const parent = (management) =>
      `<project><modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>p</artifactId><version>1</version><packaging>pom</packaging><modules><module>core</module></modules><build><pluginManagement>${management}</pluginManagement></build></project>`;
    const child =
      '<project><modelVersion>4.0.0</modelVersion><parent><groupId>g</groupId><artifactId>p</artifactId><version>1</version></parent><artifactId>core</artifactId></project>';
    const tree = (management) => ({
      'pom.xml': parent(management),
      'core/pom.xml': child,
      'core/src/main/java/a/A.java': CLASS,
      'core/src/test/java/a/slow/SlowTest.java': CLASS,
    });
    const head = tree(surefire('<excludes><exclude>**/slow/**</exclude></excludes>'));

    expect(between({ base: tree(''), head }).policyLoosenings).toEqual([
      'Maven test excludes in pom.xml added: **/slow/**',
    ]);
  });
});
