import { describe, expect, it } from 'vitest';
import { toTree } from '../../tree.mjs';
import { detectLanguageConfigEdits } from './config-files.mjs';

const detect = (file, before, after) =>
  detectLanguageConfigEdits(toTree({ [file]: before }), toTree({ [file]: after }));

const GRADLE = `plugins {
    id 'java'
    id 'jacoco'
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation 'org.junit.jupiter:junit-jupiter:5.11.4'
}

test {
    useJUnitPlatform()
}

jacocoTestReport {
    reports { xml.required = true }
}
`;

const KTS = `plugins {
    kotlin("jvm") version "2.4.21"
}

dependencies {
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}
`;

const POM = `<project>
  <properties>
    <maven.compiler.release>21</maven.compiler.release>
  </properties>
  <dependencies>
    <dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId></dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.5.2</version>
      </plugin>
    </plugins>
  </build>
</project>
`;

describe('Gradle build files', () => {
  const change = (replacement, from) =>
    detect('build.gradle', GRADLE, GRADLE.replace(from, replacement));

  it('reports nothing for a dependency, a repository or a version the task needs', () => {
    expect(
      change(
        "testImplementation 'org.junit.jupiter:junit-jupiter:5.11.4'\n    implementation 'com.google.guava:guava:33.0.0-jre'\n    testImplementation 'org.mockito:mockito-core:5.14.2'",
        "testImplementation 'org.junit.jupiter:junit-jupiter:5.11.4'",
      ),
    ).toEqual([]);
    expect(
      change(
        'mavenCentral()\n    maven { url = uri("https://repo.example.com/m2") }',
        'mavenCentral()',
      ),
    ).toEqual([]);
  });

  it('reports nothing when only a comment, a blank line or the indentation changed', () => {
    expect(
      change(
        '// tests\ntest {\n  useJUnitPlatform() // keep\n}',
        'test {\n    useJUnitPlatform()\n}',
      ),
    ).toEqual([]);
  });

  it('reports the task-level tool blocks an agent can add', () => {
    const added = change(
      'test {\n    useJUnitPlatform()\n}\n\njacocoTestCoverageVerification {\n    violationRules { rule { limit { minimum = 0.0 } } }\n}',
      'test {\n    useJUnitPlatform()\n}',
    );
    expect(added).toMatchObject([
      { kind: 'build-config-edit', path: 'build.gradle', category: 'gate-tampering' },
    ]);
    expect(added[0].detail).toContain('jacocoTestCoverageVerification');
  });

  it.each([
    ['removes useJUnitPlatform', 'test {\n    useJUnitPlatform()\n}', 'test {\n}'],
    ['excludes tests', 'useJUnitPlatform()', "useJUnitPlatform()\n    exclude '**/*Slow*'"],
    [
      'filters tests',
      'useJUnitPlatform()',
      'useJUnitPlatform()\n    filter { excludeTestsMatching "*Bad*" }',
    ],
    ['disables the test task', 'useJUnitPlatform()', 'useJUnitPlatform()\n    enabled = false'],
    ['ignores failures', 'useJUnitPlatform()', 'useJUnitPlatform()\n    ignoreFailures = true'],
    ['drops the jacoco plugin', "    id 'jacoco'\n", ''],
    ['adds checkstyle', "id 'java'", "id 'java'\n    id 'checkstyle'"],
    ['adds pmd with ignoreFailures', "id 'java'", "id 'java'\n    id 'pmd'"],
    [
      'loosens the coverage report',
      'xml.required = true',
      'xml.required = false\n    enabled = false',
    ],
    [
      'adds spotbugs as a dependency',
      "testImplementation 'org.junit.jupiter:junit-jupiter:5.11.4'",
      "testImplementation 'org.junit.jupiter:junit-jupiter:5.11.4'\n    compileOnly 'com.github.spotbugs:spotbugs-annotations:4.8.6'",
    ],
  ])('reports a build that %s', (_name, from, replacement) => {
    expect(change(replacement, from)).toMatchObject([{ kind: 'build-config-edit' }]);
  });

  it('keeps a /* in a glob string from hiding the lines after it', () => {
    const after = GRADLE.replace(
      'useJUnitPlatform()',
      'useJUnitPlatform()\n    exclude("**/*.kt")',
    );
    expect(detect('build.gradle', GRADLE, after)).toMatchObject([{ kind: 'build-config-edit' }]);
  });
});

describe('Kotlin build scripts', () => {
  const change = (replacement, from) =>
    detect('app/build.gradle.kts', KTS, KTS.replace(from, replacement));

  it('reports nothing for a new dependency or plugin the task needs', () => {
    expect(
      change(
        'testImplementation(kotlin("test"))\n    implementation("io.ktor:ktor-client-core:3.0.0")',
        'testImplementation(kotlin("test"))',
      ),
    ).toEqual([]);
    expect(
      change(
        'kotlin("jvm") version "2.4.21"\n    kotlin("plugin.serialization") version "2.4.21"',
        'kotlin("jvm") version "2.4.21"',
      ),
    ).toEqual([]);
  });

  it.each([
    [
      'adds detekt',
      'kotlin("jvm") version "2.4.21"',
      'kotlin("jvm") version "2.4.21"\n    id("io.gitlab.arturbosch.detekt") version "1.23.7"',
    ],
    [
      'turns warnings off',
      'tasks.test {',
      'kotlin { compilerOptions { allWarningsAsErrors = false } }\n\ntasks.test {',
    ],
    ['excludes a test', 'useJUnitPlatform()', 'useJUnitPlatform()\n    exclude("**/FlakyTest*")'],
    [
      'ignores failures',
      'tasks.test {\n    useJUnitPlatform()',
      'tasks.test {\n    useJUnitPlatform()\n    ignoreFailures = true',
    ],
    [
      'configures every Test task',
      'tasks.test {',
      'tasks.withType<Test> {\n    filter { excludeTestsMatching("*") }\n}\n\ntasks.test {',
    ],
  ])('reports a build that %s', (_name, from, replacement) => {
    expect(change(replacement, from)).toMatchObject([{ kind: 'build-config-edit' }]);
  });
});

describe('Maven pom.xml', () => {
  const change = (replacement, from) => detect('pom.xml', POM, POM.replace(from, replacement));
  const dependency =
    '<dependency><groupId>com.google.guava</groupId><artifactId>guava</artifactId></dependency>';

  it('reports nothing for a dependency or a plain property', () => {
    expect(change(`${dependency}\n    </dependencies>`, '</dependencies>')).toEqual([]);
    expect(
      change(
        '<maven.compiler.release>21</maven.compiler.release>\n    <guava.version>33.0.0</guava.version>',
        '<maven.compiler.release>21</maven.compiler.release>',
      ),
    ).toEqual([]);
  });

  it.each([
    [
      'skips tests with a property',
      '</properties>',
      '  <skipTests>true</skipTests>\n  </properties>',
    ],
    [
      'skips tests with maven.test.skip',
      '</properties>',
      '  <maven.test.skip>true</maven.test.skip>\n  </properties>',
    ],
    [
      'configures surefire',
      '<version>3.5.2</version>',
      '<version>3.5.2</version>\n        <configuration><excludes><exclude>**/Slow*</exclude></excludes></configuration>',
    ],
    [
      'ignores test failures',
      '<version>3.5.2</version>',
      '<version>3.5.2</version>\n        <configuration><testFailureIgnore>true</testFailureIgnore></configuration>',
    ],
    [
      'removes surefire',
      '<plugin>\n        <artifactId>maven-surefire-plugin</artifactId>\n        <version>3.5.2</version>\n      </plugin>',
      '',
    ],
    [
      'adds jacoco',
      '</plugins>',
      '<plugin><artifactId>jacoco-maven-plugin</artifactId><version>0.8.12</version></plugin>\n    </plugins>',
    ],
    [
      'adds checkstyle with failOnViolation off',
      '</plugins>',
      '<plugin>\n<artifactId>maven-checkstyle-plugin</artifactId>\n<configuration><failOnViolation>false</failOnViolation></configuration>\n</plugin>\n    </plugins>',
    ],
  ])('reports a pom that %s', (_name, from, replacement) => {
    expect(change(replacement, from)).toMatchObject([
      { kind: 'build-config-edit', path: 'pom.xml' },
    ]);
  });

  it('ignores a commented-out plugin', () => {
    expect(
      change(
        '<!-- <plugin><artifactId>jacoco-maven-plugin</artifactId></plugin> -->\n    </plugins>',
        '</plugins>',
      ),
    ).toEqual([]);
  });

  it('applies to a pom in a module folder', () => {
    const [shortcut] = detect(
      'core/pom.xml',
      POM,
      POM.replace('</properties>', '<skipTests>true</skipTests></properties>'),
    );
    expect(shortcut.path).toBe('core/pom.xml');
  });
});
