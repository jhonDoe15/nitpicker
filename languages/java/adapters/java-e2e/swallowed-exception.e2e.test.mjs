import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../test-support/gradle-e2e.mjs';
import { LOOKUP, LOOKUP_TEST } from './test-support/swallowed-exception-data.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;

const BUILD_GRADLE = `plugins {
    id 'java'
}
repositories {
    mavenCentral()
}
dependencies {
    testImplementation 'org.junit.jupiter:junit-jupiter:5.11.0'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher'
}
test {
    useJUnitPlatform()
}
`;

const POM = `<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>demo</groupId>
  <artifactId>shop</artifactId>
  <version>1</version>
  <properties>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
    <dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.11.0</version><scope>test</scope></dependency>
  </dependencies>
  <build><plugins>
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-surefire-plugin</artifactId>
      <version>3.5.2</version>
    </plugin>
  </plugins></build>
</project>
`;

const MAIN = 'src/main/java/shop/Lookup.java';
const TEST = 'src/test/java/shop/LookupTest.java';
const SWALLOWING_CATCHES = [
  [MAIN, 16],
  [MAIN, 24],
  [MAIN, 32],
  [MAIN, 40],
  [MAIN, 48],
  [MAIN, 58],
  [MAIN, 68],
  [TEST, 49],
];
const MESSAGE =
  'This catch block swallows the error: it only continues, returns, or assigns a constant such as null, false, 0, a string or an empty collection or Optional. Log it, rethrow it with the cause, or use it; or return a named default or a value built from the error. In a test, use assertThrows. If it is right here, add an exception for pmd/SwallowedException in nitpicker.config.json.';

const roots = [];

function project(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-swallowed-e2e-')));
  roots.push(root);
  for (const [file, content] of Object.entries({
    [MAIN]: LOOKUP,
    [TEST]: LOOKUP_TEST,
    ...files,
  })) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

const swallowed = (findings) =>
  findings
    .filter(({ tool, rule }) => tool === 'pmd' && rule === 'SwallowedException')
    .map(({ path: file, location, message }) => [file, location?.line, message])
    .toSorted((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);

const expected = SWALLOWING_CATCHES.map(([file, line]) => [file, line, MESSAGE]);

describe.skipIf(!enabled)('PMD SwallowedException', () => {
  afterAll(() => {
    for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it(
    'reports a catch that only returns, continues or assigns a constant on Gradle, in tests too',
    () => {
      const root = project({
        'settings.gradle': "rootProject.name = 'shop'\n",
        'build.gradle': BUILD_GRADLE,
      });

      expect(swallowed(collectJavaFindings(root, { gradle, policy: {} }))).toEqual(expected);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'reports the same catches on Maven',
    () => {
      const root = project({ 'pom.xml': POM });

      expect(swallowed(collectJavaFindings(root, { maven, policy: {} }))).toEqual(expected);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
