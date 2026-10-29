import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import { declaredToolChoices } from '../../tool-config/declared/declared-choices.mjs';
import { runErrorProne } from '../../../maven/errorprone/maven-errorprone.mjs';
import {
  ORDERINGS,
  enabled,
  gradle,
  maven,
  ofTool,
  pinnedTools,
  projectWith,
  useDeclaredProjects,
} from './__tests__/declared-projects.mjs';

const HOLDER = `package demo;

public final class Holder {
  public boolean same(String left, String right) {
    return left == right;
  }

  public int count(String text) {
    int spare = 1;
    String value = text;
    value = value.trim();
    return value.length();
  }
}
`;
const SKIPPED = `package demo;

public final class Skipped {
  public boolean same(String left, String right) {
    return left == right;
  }
}
`;
const ERRORPRONE_BLOCK = `tasks.withType(JavaCompile).configureEach {
    options.errorprone {
        disable('ReferenceEquality')
        enable('UnusedVariable', 'Var')
        excludedPaths = '.*/Skipped[.]java'
    }
}
`;
const GRADLE_BUILD = `plugins {
    id 'java'
    id 'net.ltgt.errorprone' version '4.1.0'
}

repositories {
    mavenCentral()
}

dependencies {
    errorprone 'com.google.errorprone:error_prone_core:2.50.0'
    testImplementation 'org.junit.jupiter:junit-jupiter:5.11.4'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher:1.11.4'
}

test {
    useJUnitPlatform()
}

tasks.withType(JavaCompile).configureEach {
    options.compilerArgs.add('-XDaddTypeAnnotationsToSymbol=true')
}

${ERRORPRONE_BLOCK}`;
const PLUGIN_ARGUMENT = [
  '-Xplugin:ErrorProne',
  '-Xep:ReferenceEquality:OFF',
  '-Xep:UnusedVariable:WARN',
  '-Xep:Var:WARN',
  '-XepExcludedPaths:.*/Skipped[.]java',
].join(' ');
const MAVEN_COMPILER = `<build><plugins><plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <version>3.13.0</version>
    <configuration>
      <compilerArgs>
        <arg>-XDcompilePolicy=simple</arg>
        <arg>-XDaddTypeAnnotationsToSymbol=true</arg>
        <arg>--should-stop=ifError=FLOW</arg>
        <arg>${PLUGIN_ARGUMENT}</arg>
      </compilerArgs>
      <annotationProcessorPaths>
        <path>
          <groupId>com.google.errorprone</groupId>
          <artifactId>error_prone_core</artifactId>
          <version>2.50.0</version>
        </path>
      </annotationProcessorPaths>
    </configuration>
  </plugin></plugins></build>
</project>`;
const JVM_CONFIG = [
  ...['api', 'file', 'main', 'model', 'parser', 'processing', 'tree', 'util'].map(
    (name) => `--add-exports jdk.compiler/com.sun.tools.javac.${name}=ALL-UNNAMED`,
  ),
  ...['code', 'comp'].map(
    (name) => `--add-opens jdk.compiler/com.sun.tools.javac.${name}=ALL-UNNAMED`,
  ),
].join('\n');
const REAL_CHECKS = [
  ['Holder.java ReferenceEquality', 'Skipped.java ReferenceEquality'],
  ['Holder.java ReferenceEquality', 'Holder.java UnusedVariable', 'Holder.java Var'],
  ['Holder.java ReferenceEquality', 'Holder.java UnusedVariable', 'Holder.java Var'],
  ['Holder.java ReferenceEquality', 'Holder.java Var'],
];
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/gradle-project');
const mavenFixture = path.resolve(import.meta.dirname, '../../../maven/fixtures/single/pom.xml');

function errorproneChecks(root, precedence, tools) {
  const configs = declaredToolChoices(root, { toolPrecedence: { errorprone: precedence } });
  const reportDir = path.join(root, `report-${precedence.join('-')}`);
  const classes = path.join(root, 'classes');
  mkdirSync(reportDir, { recursive: true });
  mkdirSync(classes, { recursive: true });
  runErrorProne({
    module: {
      basedir: root,
      sourceRoots: [path.join(root, 'src/main/java')],
      testSourceRoots: [],
      outputDirectory: classes,
      testOutputDirectory: path.join(root, 'test-classes'),
      compiler: { compilerArgs: [], release: '21' },
    },
    reportDir,
    tools,
    classpaths: { mainCompile: [], testCompile: [] },
    configs,
  });
  const report = JSON.parse(readFileSync(path.join(reportDir, 'errorprone.json'), 'utf8'));
  return [
    ...new Set(
      report.map(({ file, message }) => `${path.basename(file)} ${/^\[(\w+)\]/u.exec(message)[1]}`),
    ),
  ].sort();
}

describe.skipIf(!enabled)('Error Prone with the flags a build declares', () => {
  useDeclaredProjects();

  const realRoot = () =>
    projectWith({
      'build.gradle': ERRORPRONE_BLOCK,
      'src/main/java/demo/Holder.java': HOLDER,
      'src/main/java/demo/Skipped.java': SKIPPED,
    });

  it.each(ORDERINGS.map((precedence, index) => [precedence, REAL_CHECKS[index]]))(
    'runs the real Error Prone with precedence %j',
    (precedence, checks) => {
      expect(errorproneChecks(realRoot(), precedence, pinnedTools())).toEqual(checks);
    },
    180_000,
  );

  const findings = (root, build) =>
    ofTool(
      collectJavaFindings(root, {
        ...build,
        policy: { toolPrecedence: { errorprone: ['project', 'nitpicker'] }, policyRoot: root },
      }),
      'errorprone',
    ).filter((finding) => /(?:Holder|Skipped)\.java$/u.test(finding));

  it('applies the declared flags on Gradle', () => {
    const root = twinProject((project) => {
      writeFileSync(path.join(project, 'build.gradle'), GRADLE_BUILD);
    });

    expect(findings(root, { gradle })).toEqual(REAL_CHECKS[2].map(twinFinding));
  }, 180_000);

  it('applies the declared flags on Maven', () => {
    const root = twinProject((project) => {
      rmSync(path.join(project, 'build.gradle'));
      rmSync(path.join(project, 'settings.gradle'));
      mkdirSync(path.join(project, '.mvn'));
      writeFileSync(path.join(project, '.mvn/jvm.config'), JVM_CONFIG);
      writeFileSync(
        path.join(project, 'pom.xml'),
        readFileSync(mavenFixture, 'utf8').replace('</project>', MAVEN_COMPILER),
      );
    });

    expect(findings(root, { maven })).toEqual(REAL_CHECKS[2].map(twinFinding));
  }, 180_000);
});

function twinFinding(check) {
  const [file, rule] = check.split(' ');
  return `${rule} ${file}`;
}

function twinProject(build) {
  const root = projectWith({});
  cpSync(fixtures, root, { recursive: true });
  for (const file of ['src/test/java/demo/ArchitectureTest.java']) {
    if (existsSync(path.join(root, file))) {
      rmSync(path.join(root, file));
    }
  }
  writeFileSync(path.join(root, 'src/main/java/demo/Holder.java'), HOLDER);
  writeFileSync(path.join(root, 'src/main/java/demo/Skipped.java'), SKIPPED);
  build(root);
  return root;
}
