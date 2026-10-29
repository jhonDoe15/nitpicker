import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import { declaredToolChoices } from '../../tool-config/declared/declared-choices.mjs';
import { NITPICKER_PIT_ARGUMENTS } from '../../tool-config/declared/pit-declared.mjs';
import {
  ORDERINGS,
  compiled,
  enabled,
  gradle,
  maven,
  pinnedTools,
  projectWith,
  runJar,
  useDeclaredProjects,
} from './__tests__/declared-projects.mjs';

const CALC = `package demo;

public final class Calc {
  public boolean ten(int value) {
    return value == 10;
  }

  public String label() {
    return "calc";
  }
}
`;
const CALC_TEST = `package demo;

import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class CalcTest {
  @Test
  void tenIsTen() {
    assertTrue(new Calc().ten(10));
  }
}
`;
const PITEST_BLOCK = `pitest {
    mutators = ['REMOVE_CONDITIONALS']
    excludedMethods = ['label']
}
`;
const GRADLE_BUILD = `plugins {
    id 'java'
    id 'info.solidsoft.pitest' version '1.15.0'
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation 'org.junit.jupiter:junit-jupiter:5.11.4'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher:1.11.4'
}

test {
    useJUnitPlatform()
}

${PITEST_BLOCK}`;
const MAVEN_PLUGIN = `<build><plugins><plugin>
    <groupId>org.pitest</groupId>
    <artifactId>pitest-maven</artifactId>
    <version>1.17.4</version>
    <configuration>
      <mutators><mutator>REMOVE_CONDITIONALS</mutator></mutators>
      <excludedMethods><param>label</param></excludedMethods>
    </configuration>
  </plugin></plugins></build>
</project>`;
const JUNIT = {
  name: 'declared-junit',
  coordinates: [
    'org.junit.jupiter:junit-jupiter:5.11.4',
    'org.junit.platform:junit-platform-launcher:1.11.4',
  ],
};
const REAL_MUTANTS = [
  [
    'label EmptyObjectReturnValsMutator',
    'ten BooleanTrueReturnValsMutator',
    'ten NegateConditionalsMutator',
  ],
  [
    'ten BooleanTrueReturnValsMutator',
    'ten NegateConditionalsMutator',
    'ten RemoveConditionalMutator_EQUAL_ELSE',
    'ten RemoveConditionalMutator_EQUAL_IF',
  ],
  [
    'ten BooleanTrueReturnValsMutator',
    'ten NegateConditionalsMutator',
    'ten RemoveConditionalMutator_EQUAL_ELSE',
    'ten RemoveConditionalMutator_EQUAL_IF',
  ],
  ['ten BooleanTrueReturnValsMutator', 'ten NegateConditionalsMutator'],
];
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/gradle-project');
const mavenFixture = path.resolve(import.meta.dirname, '../../../maven/fixtures/single/pom.xml');

function mutantsIn(xml) {
  const mutants = [...xml.matchAll(/<mutation\b[\s\S]*?<\/mutation>/gu)].map((match) => {
    const [, method] = /<mutatedMethod>([^<]+)<\/mutatedMethod>/u.exec(match[0]);
    const [, mutator] = /<mutator>[^<]*\.([^.<]+)<\/mutator>/u.exec(match[0]);
    return `${method} ${mutator}`;
  });
  return [...new Set(mutants)].sort();
}

function pitMutants(root, precedence, tools) {
  const choices = declaredToolChoices(root, { toolPrecedence: { pit: precedence } });
  const classes = compiled(root, ['src/main/java/demo/Calc.java']);
  const testClasses = path.join(root, 'test-classes');
  const classpath = [...tools.pit, ...tools['pit-junit5'], ...tools[JUNIT.name]];
  compiled(root, ['src/test/java/demo/CalcTest.java'], {
    classes: testClasses,
    classpath: [classes, ...tools[JUNIT.name]],
  });
  const reportDir = path.join(root, `pit-${precedence.join('-')}`);
  runJar({
    classpath,
    mainClass: 'org.pitest.mutationtest.commandline.MutationCoverageReport',
    args: [
      ...[
        '--reportDir',
        reportDir,
        '--targetClasses',
        'demo.Calc',
        '--targetTests',
        'demo.CalcTest',
      ],
      ...['--sourceDirs', path.join(root, 'src/main/java')],
      ...['--classPath', [classes, testClasses, ...tools[JUNIT.name]].join(',')],
      ...['--mutableCodePaths', classes, '--outputFormats', 'XML', '--timestampedReports', 'false'],
      ...(choices.pit?.arguments ?? NITPICKER_PIT_ARGUMENTS),
    ],
    cwd: root,
  });
  return mutantsIn(readFileSync(path.join(reportDir, 'mutations.xml'), 'utf8'));
}

describe.skipIf(!enabled)('PIT with the settings a build declares', () => {
  useDeclaredProjects();

  const realRoot = () =>
    projectWith({
      'build.gradle': PITEST_BLOCK,
      'src/main/java/demo/Calc.java': CALC,
      'src/test/java/demo/CalcTest.java': CALC_TEST,
    });

  it.each(ORDERINGS.map((precedence, index) => [precedence, REAL_MUTANTS[index]]))(
    'runs the real PIT with precedence %j',
    (precedence, mutants) => {
      expect(pitMutants(realRoot(), precedence, pinnedTools([JUNIT]))).toEqual(mutants);
    },
    180_000,
  );

  const mutants = (root, build) =>
    collectJavaFindings(root, {
      ...build,
      policy: { toolPrecedence: { pit: ['project', 'nitpicker'] }, policyRoot: root },
    })
      .filter((finding) => finding.tool === 'pit' && finding.path.endsWith('Calc.java'))
      .map(({ rule, message }) => `${rule} ${message.split(':')[0]}`)
      .sort();

  it('applies the declared settings on Gradle', () => {
    const root = twinProject((project) => {
      writeFileSync(path.join(project, 'build.gradle'), GRADLE_BUILD);
    });

    expect(mutants(root, { gradle })).toEqual(TWIN_MUTANTS);
  }, 180_000);

  it('applies the declared settings on Maven', () => {
    const root = twinProject((project) => {
      rmSync(path.join(project, 'build.gradle'));
      rmSync(path.join(project, 'settings.gradle'));
      writeFileSync(
        path.join(project, 'pom.xml'),
        readFileSync(mavenFixture, 'utf8').replace('</project>', MAVEN_PLUGIN),
      );
    });

    expect(mutants(root, { maven })).toEqual(TWIN_MUTANTS);
  }, 180_000);
});

const TWIN_MUTANTS = [
  'mutant-survived Survived BooleanTrueReturnValsMutator',
  'mutant-survived Survived RemoveConditionalMutator_EQUAL_IF',
];

function twinProject(build) {
  const root = projectWith({});
  cpSync(fixtures, root, { recursive: true });
  rmSync(path.join(root, 'src/test/java/demo/ArchitectureTest.java'));
  writeFileSync(path.join(root, 'src/main/java/demo/Calc.java'), CALC);
  writeFileSync(path.join(root, 'src/test/java/demo/CalcTest.java'), CALC_TEST);
  build(root);
  return root;
}
