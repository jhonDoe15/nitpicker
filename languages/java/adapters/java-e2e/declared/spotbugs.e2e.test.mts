import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mts';
import {
  NITPICKER_SPOTBUGS as NITPICKER_SPOTBUGS_UNTYPED,
  spotbugsArguments as spotbugsArgumentsUntyped,
} from '../../tool-config/declared/spotbugs-declared.mts';
import { fieldOf, listOf, parseJson, textOf } from '../../../../../shared/values/readers.mts';
import {
  type BuildCommand,
  type Tools,
  classpathOf,
  compiled,
  choiceArguments,
  declaredToolChoices,
  enabled,
  gradle,
  maven,
  ofTool,
  pinnedTools,
  projectWith,
  runJar,
  useDeclaredProjects,
} from './__tests__/declared-projects.mts';
import { orderingCases } from './__tests__/ordering-cases.mts';

const HOLDER = `package demo;

import java.util.Date;

public final class Holder {
  private final Date when = new Date();

  public Date when() {
    return when;
  }

  public String loud(String text) {
    return text.toUpperCase();
  }
}
`;
const EXCLUDE = `<FindBugsFilter>
  <Match><Bug pattern="EI_EXPOSE_REP"/></Match>
</FindBugsFilter>
`;
const SPOTBUGS_BLOCK = `spotbugs {
    reportLevel = Confidence.valueOf('LOW')
    excludeFilter = file('config/spotbugs/exclude.xml')
}
`;
const GRADLE_BUILD = `import com.github.spotbugs.snom.Confidence

plugins {
    id 'java'
    id 'com.github.spotbugs' version '6.1.7'
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

${SPOTBUGS_BLOCK}`;
const MAVEN_PLUGIN = `<build><plugins><plugin>
    <groupId>com.github.spotbugs</groupId>
    <artifactId>spotbugs-maven-plugin</artifactId>
    <version>4.9.3.0</version>
    <configuration>
      <threshold>Low</threshold>
      <excludeFilterFile>\${project.basedir}/config/spotbugs/exclude.xml</excludeFilterFile>
    </configuration>
  </plugin></plugins></build>
</project>`;
const REAL_RULES = [['EI_EXPOSE_REP'], ['DM_CONVERT_CASE'], ['DM_CONVERT_CASE'], []];
const NITPICKER_SPOTBUGS: { effort: string; threshold: string } = NITPICKER_SPOTBUGS_UNTYPED;
const spotbugsArguments: (settings: { effort: string; threshold: string }) => string[] =
  spotbugsArgumentsUntyped;
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/gradle-project');
const mavenFixture = path.resolve(import.meta.dirname, '../../../maven/fixtures/single/pom.xml');

function spotbugsRules(root: string, precedence: readonly string[], tools: Tools): string[] {
  const choices = declaredToolChoices(root, { toolPrecedence: { spotbugs: precedence } });
  const settings = choiceArguments(choices, 'spotbugs', spotbugsArguments(NITPICKER_SPOTBUGS));
  const report = path.join(root, `spotbugs-${precedence.join('-')}.sarif`);
  runJar({
    classpath: classpathOf(tools, 'spotbugs'),
    mainClass: 'edu.umd.cs.findbugs.FindBugs2',
    args: [
      ...settings,
      '-sarif',
      '-output',
      report,
      compiled(root, ['src/main/java/demo/Holder.java']),
    ],
    cwd: root,
  });
  const sarif: unknown = parseJson(readFileSync(report, 'utf8'));
  return listOf(fieldOf(sarif, 'runs'))
    .flatMap((run) =>
      listOf(fieldOf(run, 'results')).map((result) => textOf(fieldOf(result, 'ruleId'))),
    )
    .sort();
}

describe.skipIf(!enabled)('SpotBugs with the settings a build declares', () => {
  useDeclaredProjects();

  const realRoot = () =>
    projectWith({
      'build.gradle': SPOTBUGS_BLOCK,
      'config/spotbugs/exclude.xml': EXCLUDE,
      'src/main/java/demo/Holder.java': HOLDER,
    });

  it.each(orderingCases(REAL_RULES))(
    'runs the real SpotBugs with precedence %j',
    (precedence, rules) => {
      expect(spotbugsRules(realRoot(), precedence, pinnedTools())).toEqual(rules);
    },
    180_000,
  );

  const findings = (root: string, build: BuildCommand, precedence: readonly string[]) =>
    ofTool(
      collectJavaFindings(root, {
        ...build,
        policy: { toolPrecedence: { spotbugs: precedence }, policyRoot: root },
      }),
      'spotbugs',
    );

  it('applies the declared filter and threshold on Gradle', () => {
    const root = twinProject((project: string) => {
      writeFileSync(path.join(project, 'build.gradle'), GRADLE_BUILD);
    });

    expect(findings(root, { gradle }, ['project', 'nitpicker'])).toEqual([
      'DM_CONVERT_CASE Holder.java',
    ]);
  }, 180_000);

  it('applies the declared filter and threshold on Maven', () => {
    const root = twinProject((project: string) => {
      rmSync(path.join(project, 'build.gradle'));
      rmSync(path.join(project, 'settings.gradle'));
      writeFileSync(
        path.join(project, 'pom.xml'),
        readFileSync(mavenFixture, 'utf8').replace('</project>', MAVEN_PLUGIN),
      );
    });

    expect(findings(root, { maven }, ['project', 'nitpicker'])).toEqual([
      'DM_CONVERT_CASE Holder.java',
    ]);
  }, 180_000);
});

function twinProject(build: (project: string) => void): string {
  const root = projectWith({
    'config/spotbugs/exclude.xml': EXCLUDE,
  });
  cpSync(fixtures, root, { recursive: true });
  rmSync(path.join(root, 'src/test/java/demo/ArchitectureTest.java'));
  writeFileSync(path.join(root, 'src/main/java/demo/Holder.java'), HOLDER);
  build(root);
  return root;
}
