import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const FIXTURE = path.resolve(import.meta.dirname, '../../../fixtures/kotlin-spring');

const MARKER = /\/\/ violation: (.*)$/;

export function markedViolations() {
  const sources = path.join(FIXTURE, 'src/main/kotlin/demo');
  return readdirSync(sources)
    .toSorted()
    .flatMap((name) =>
      readFileSync(path.join(sources, name), 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          (MARKER.exec(line)?.[1].split(', ') ?? []).map(
            (rule) => `${name}:${String(index + 1)} ${rule}`,
          ),
        ),
    );
}

const SPRING_VERSIONS = {
  context: '6.2.10',
  data: '3.5.3',
  boot: '3.5.5',
  security: '6.5.3',
};

const PROVIDED = [
  ['org.springframework', 'spring-context', SPRING_VERSIONS.context],
  ['org.springframework', 'spring-tx', SPRING_VERSIONS.context],
  ['org.springframework', 'spring-web', SPRING_VERSIONS.context],
  ['org.springframework.data', 'spring-data-jpa', SPRING_VERSIONS.data],
  ['org.springframework.boot', 'spring-boot-autoconfigure', SPRING_VERSIONS.boot],
  ['org.springframework.security', 'spring-security-crypto', SPRING_VERSIONS.security],
  ['jakarta.persistence', 'jakarta.persistence-api', '3.1.0'],
  ['jakarta.validation', 'jakarta.validation-api', '3.0.2'],
  ['jakarta.transaction', 'jakarta.transaction-api', '2.0.1'],
  ['jakarta.inject', 'jakarta.inject-api', '2.0.1'],
  ['jakarta.annotation', 'jakarta.annotation-api', '2.1.1'],
];

const ARCHUNIT = ['com.tngtech.archunit', 'archunit-junit5', '1.4.1'];

export const GRADLE_BUILD = `plugins {
    kotlin("jvm") version "2.4.21"
}

repositories {
    mavenCentral()
}

dependencies {
${PROVIDED.map(([group, artifact, version]) => `    compileOnly("${group}:${artifact}:${version}")`).join('\n')}
    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.4")
    testImplementation("${ARCHUNIT.join(':')}")
}

tasks.test {
    useJUnitPlatform()
}
`;

function dependency([group, artifact, version], scope) {
  return `    <dependency><groupId>${group}</groupId><artifactId>${artifact}</artifactId><version>${version}</version>${scope === undefined ? '' : `<scope>${scope}</scope>`}</dependency>`;
}

export const MAVEN_POM = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>demo</groupId>
  <artifactId>kotlin-spring</artifactId>
  <version>1.0</version>
  <properties>
    <kotlin.version>2.4.21</kotlin.version>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
${dependency(['org.jetbrains.kotlin', 'kotlin-stdlib', '${kotlin.version}'])}
${PROVIDED.map((entry) => dependency(entry, 'provided')).join('\n')}
${dependency(['org.jetbrains.kotlin', 'kotlin-test-junit5', '${kotlin.version}'], 'test')}
${dependency(['org.junit.jupiter', 'junit-jupiter', '5.11.4'], 'test')}
${dependency(ARCHUNIT, 'test')}
  </dependencies>
  <build>
    <sourceDirectory>src/main/kotlin</sourceDirectory>
    <testSourceDirectory>src/test/kotlin</testSourceDirectory>
    <plugins>
      <plugin>
        <groupId>org.jetbrains.kotlin</groupId>
        <artifactId>kotlin-maven-plugin</artifactId>
        <version>\${kotlin.version}</version>
        <executions>
          <execution><id>compile</id><phase>compile</phase><goals><goal>compile</goal></goals></execution>
          <execution>
            <id>test-compile</id><phase>test-compile</phase><goals><goal>test-compile</goal></goals>
          </execution>
        </executions>
      </plugin>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.5.2</version>
      </plugin>
    </plugins>
  </build>
</project>
`;

export const CLOCK = `package demo

import java.util.Date

class Clock {
    fun now(): Date = Date()
}
`;

export const CLOCK_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertNotNull

class ClockTest {
    @Test
    fun now() {
        assertNotNull(Clock().now())
    }
}
`;

export const ARCHITECTURE_TEST = `package demo

import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.junit.AnalyzeClasses
import com.tngtech.archunit.junit.ArchTest
import com.tngtech.archunit.lang.ArchRule
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses

@AnalyzeClasses(packages = ["demo"], importOptions = [ImportOption.DoNotIncludeTests::class])
class ArchitectureTest {
    @ArchTest
    @JvmField
    val noDates: ArchRule =
        noClasses().should().dependOnClassesThat().haveFullyQualifiedName("java.util.Date")
}
`;

export const APPLICATION_PROPERTIES = 'spring.jpa.hibernate.ddl-auto=create\n';

export function writeKotlinSpringProject(root, build) {
  cpSync(path.join(FIXTURE, 'src'), path.join(root, 'src'), { recursive: true });
  const files = {
    ...build,
    'src/main/kotlin/demo/Clock.kt': CLOCK,
    'src/test/kotlin/demo/ClockTest.kt': CLOCK_TEST,
    'src/test/kotlin/demo/ArchitectureTest.kt': ARCHITECTURE_TEST,
    'src/main/resources/application.properties': APPLICATION_PROPERTIES,
  };
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
}

export const GRADLE_FILES = {
  'build.gradle.kts': GRADLE_BUILD,
  'settings.gradle.kts': 'rootProject.name = "kotlin-spring"\n',
};

export const MAVEN_FILES = { 'pom.xml': MAVEN_POM };

export const EXPECTED_CONFIG_AND_ARCHITECTURE = [
  'archunit noDates src/main/kotlin/demo/Clock.kt',
  'spring ddl-auto src/main/resources/application.properties',
  'spring open-in-view src/main/resources/application.properties',
];
