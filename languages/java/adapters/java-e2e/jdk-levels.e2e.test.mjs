import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import { featureVersion, jdkHomes } from '../../maven/errorprone/maven-jdk.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../test-support/gradle-e2e.mjs';
import { KOTLIN_POLICY, kotlinLevelFiles } from './test-support/kotlin-levels-data.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const kotlinEnabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const gradleOnJdk25 = process.env.NITPICKER_GRADLE_ON_JDK25;
const roots = [];

function jdkHome(feature) {
  return jdkHomes().find((home) => {
    const result = spawnSync(path.join(home, 'bin', 'java'), ['-version'], { encoding: 'utf8' });
    return featureVersion(`${result.stderr}${result.stdout}`) === feature;
  });
}

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

function projectFor(build, release) {
  const root = mkdtempSync(path.join(tmpdir(), `nitpicker-jdk-${String(release)}-`));
  roots.push(root);
  const files =
    build === 'kotlin'
      ? kotlinLevelFiles(release)
      : {
          ...BUILD_FILES[build](release),
          ...SOURCES,
          'src/main/java/demo/Shapes.java': LEVELS[release].shapes,
          'src/main/java/demo/Messy.java': LEVELS[release].messy,
        };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const FAILED_TEST = 'demo.BrokenTest.parses: expected: <2> but was: <3>';

function analyze(build, release, runner = { gradle, jdk: LEVELS[release].gradleJdk }) {
  const javaHome = jdkHome(build === 'maven' ? release : runner.jdk);
  if (javaHome !== undefined) {
    vi.stubEnv('JAVA_HOME', javaHome);
  }
  const findings = collectJavaFindings(projectFor(build, release), {
    ...(build === 'maven' ? { maven } : { gradle: runner.gradle }),
    policy: build === 'kotlin' ? KOTLIN_POLICY : { testSeconds: { unitTestSeconds: -1 } },
  });
  return {
    toolErrors: findings
      .filter((finding) => finding.classification === 'tool-error')
      .map(({ tool, rule, message }) => ({ tool, rule, message })),
    reported: [
      ...new Set(
        findings
          .filter(
            (finding) =>
              finding.classification !== 'tool-error' &&
              finding.metric === undefined &&
              finding.tool !== 'test-runtime',
          )
          .map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`),
      ),
    ].sort(),
  };
}

const TESTS_FAILED = {
  tool: 'tests',
  rule: 'tests-failed',
  message: [
    'Tests fail in the head snapshot. Make each failing test pass:',
    `  ${FAILED_TEST}`,
    'The static analyzers ran as usual; coverage and CRAP come from the tests that ran.',
    'Mutation testing (PIT) left out the test classes demo.BrokenTest.',
  ].join('\n'),
};

const REPORTED = [
  'forbiddenapis legacy-date-time Shapes.java',
  'google-java-format format Messy.java',
  'jacoco changed-branch-coverage Shapes.java',
  'jacoco uncovered-method Messy.java',
  'jacoco uncovered-method Shapes.java',
  'pit mutant-nocoverage Shapes.java',
  'pmd CatchOnlyLogsOrReturnsDefault Shapes.java',
];

const EXPECTED_ON_EACH_LEVEL = {
  toolErrors: [TESTS_FAILED],
  reported: [
    'checkstyle LeftCurlyEol Messy.java',
    'checkstyle RightCurlyAlone Messy.java',
    ...REPORTED,
  ],
};
const EXPECTED = { 17: EXPECTED_ON_EACH_LEVEL, 25: EXPECTED_ON_EACH_LEVEL };

describe.skipIf(!enabled)('the Java preset on each supported JDK level', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    spawnSync(gradle, ['--stop'], { stdio: 'ignore' });
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
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

const KOTLIN_EXPECTED = {
  toolErrors: [TESTS_FAILED],
  reported: [
    'crap crap-score-limit Shapes.kt',
    'detekt detekt.style.FunctionOnlyReturningConstant Shapes.kt',
    'jacoco changed-branch-coverage Shapes.kt',
    'jacoco uncovered-method Messy.kt',
    'jacoco uncovered-method Shapes.kt',
    'ktfmt format Messy.kt',
    'ktfmt format Shapes.kt',
    'pit mutant-nocoverage Messy.kt',
    'pit mutant-nocoverage Shapes.kt',
    'structure function-parameters-limit Shapes.kt',
  ],
};

describe.skipIf(!kotlinEnabled)('the Kotlin preset on each supported JDK level', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  for (const release of [17, 25]) {
    it.skipIf(jdkHome(release) === undefined)(
      `runs every analyzer on a Kotlin project at release ${String(release)}`,
      () => {
        expect(analyze('kotlin', release)).toEqual(KOTLIN_EXPECTED);
      },
      GRADLE_STEP_TIMEOUT_MS,
    );
  }

  it.skipIf(gradleOnJdk25 === undefined || jdkHome(25) === undefined)(
    'runs detekt on an older JDK when Gradle itself runs on JDK 25',
    () => {
      expect(analyze('kotlin', 25, { gradle: gradleOnJdk25, jdk: 25 })).toEqual(KOTLIN_EXPECTED);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
