import { spawnSync } from 'node:child_process';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { GRADLE_STEP_TIMEOUT_MS } from '../test-support/gradle-e2e.mjs';
import {
  analyzeAtLevel,
  jdkHome,
  removeLevelProjects,
  TESTS_FAILED,
} from './test-support/jdk-levels-run.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const gradleOnJdk25 = process.env.NITPICKER_GRADLE_ON_JDK25;

const RECORDS = `  public sealed interface Shape permits Circle, Square {}

  public record Circle(double radius) implements Shape {}

  public record Square(double side) implements Shape {}

  private final List<String> names;
`;

const PARSE_AND_STAMP = `  public int parse(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException %CAUGHT%) {
      return names.size();
    }
  }

  public Date stamp() {
    return new Date();
  }
}
`;

const RELEASE_17 = `package demo;

import java.util.Date;
import java.util.List;

public final class Shapes {
${RECORDS}
  public Shapes(List<String> names) {
    this.names = List.copyOf(names);
  }

  public double area(Shape shape) {
    if (shape instanceof Circle circle) {
      return Math.PI * circle.radius() * circle.radius();
    }
    Square square = (Square) shape;
    return square.side() * square.side();
  }

${PARSE_AND_STAMP.replace('%CAUGHT%', 'e')}`;

const RELEASE_25 = `package demo;

import module java.base;

public final class Shapes {
${RECORDS}
  public Shapes(List<String> names) {
    if (names.isEmpty()) {
      throw new IllegalArgumentException("no names");
    }
    super();
    this.names = List.copyOf(names);
  }

  public double area(Shape shape) {
    return switch (shape) {
      case Circle(double radius) -> Math.PI * radius * radius;
      case Square(double side) -> side * side;
    };
  }

${PARSE_AND_STAMP.replace('%CAUGHT%', '_')}`;

const testClass = (name, body) => `package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import org.junit.jupiter.api.Test;

class ${name} {
  @Test
  void parses() {
    ${body}
  }
}
`;

const SOURCES = {
  'src/test/java/demo/ShapesTest.java': testClass(
    'ShapesTest',
    'assertEquals(3, new Shapes(List.of("a")).parse("3"));',
  ),
  'src/test/java/demo/BrokenTest.java': testClass(
    'BrokenTest',
    'assertEquals(2, new Shapes(List.of("a")).parse("3"));',
  ),
};

const MESSY = (imports) =>
  `package demo;\n\n${imports}\n\npublic final class Messy { public List<String> one() { return List.of(); } }\n`;

const LEVELS = {
  17: {
    shapes: RELEASE_17,
    messy: MESSY('import java.util.List;'),
    gradleJdk: 17,
  },
  25: { shapes: RELEASE_25, messy: MESSY('import module java.base;'), gradleJdk: undefined },
};

const DEPENDENCIES = [
  ['org.junit.jupiter', 'junit-jupiter', '5.11.4'],
  ['org.junit.platform', 'junit-platform-launcher', '1.11.4'],
];

const BUILD_FILES = {
  gradle: (release) => ({
    'settings.gradle': "rootProject.name = 'levels'\n",
    'build.gradle': `plugins {
    id 'java'
}

repositories {
    mavenCentral()
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(${String(release)})
    }
}

dependencies {
${DEPENDENCIES.map(([group, name, version]) => `    testImplementation '${group}:${name}:${version}'`).join('\n')}
}

test {
    useJUnitPlatform()
}
`,
  }),
  maven: (release) => ({
    'pom.xml': `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>demo</groupId>
  <artifactId>levels</artifactId>
  <version>1.0</version>
  <properties>
    <maven.compiler.release>${String(release)}</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
${DEPENDENCIES.map(
  ([group, name, version]) =>
    `    <dependency><groupId>${group}</groupId><artifactId>${name}</artifactId>` +
    `<version>${version}</version><scope>test</scope></dependency>`,
).join('\n')}
  </dependencies>
</project>
`,
  }),
};

function analyze(build, release, runner = { gradle, jdk: LEVELS[release].gradleJdk }) {
  return analyzeAtLevel({
    release,
    files: {
      ...BUILD_FILES[build](release),
      ...SOURCES,
      'src/main/java/demo/Shapes.java': LEVELS[release].shapes,
      'src/main/java/demo/Messy.java': LEVELS[release].messy,
    },
    jdk: build === 'maven' ? release : runner.jdk,
    build: build === 'maven' ? { maven } : { gradle: runner.gradle },
    policy: { testSeconds: { unitTestSeconds: -1 } },
  });
}

const REPORTED = [
  'forbiddenapis legacy-date-time Shapes.java',
  'google-java-format format Messy.java',
  'jacoco changed-branch-coverage Shapes.java',
  'jacoco uncovered-method Messy.java',
  'jacoco uncovered-method Shapes.java',
  'pit mutant-nocoverage Shapes.java',
  'pmd CatchOnlyLogsOrReturnsDefault Shapes.java',
];

const EXPECTED_ON_EACH_LEVEL = { toolErrors: [TESTS_FAILED], reported: REPORTED };
const EXPECTED = { 17: EXPECTED_ON_EACH_LEVEL, 25: EXPECTED_ON_EACH_LEVEL };

describe.skipIf(!enabled)('the Java preset on each supported JDK level', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    spawnSync(gradle, ['--stop'], { stdio: 'ignore' });
    removeLevelProjects();
  });

  for (const release of [17, 25]) {
    for (const build of ['gradle', 'maven']) {
      it.skipIf(jdkHome(release) === undefined)(
        `runs every analyzer on a ${build} project at release ${String(release)}`,
        () => {
          expect(analyze(build, release)).toEqual(EXPECTED[release]);
        },
        GRADLE_STEP_TIMEOUT_MS,
      );
    }
  }

  it.skipIf(gradleOnJdk25 === undefined || jdkHome(25) === undefined)(
    'runs every analyzer on a gradle project when Gradle itself runs on JDK 25',
    () => {
      expect(analyze('gradle', 25, { gradle: gradleOnJdk25, jdk: 25 })).toEqual(EXPECTED[25]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
