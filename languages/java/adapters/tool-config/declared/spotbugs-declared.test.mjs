import { describe, expect, it } from 'vitest';
import { spotbugsArguments, spotbugsDeclarations, spotbugsLayers } from './spotbugs-declared.mjs';
import { readDeclaredBuild } from './declared-build.mjs';

function sourceOf(files) {
  return {
    paths: () => Object.keys(files),
    readMany: (wanted) =>
      new Map(wanted.filter((file) => file in files).map((file) => [file, files[file]])),
  };
}

const declarationsOf = (files) =>
  spotbugsDeclarations(readDeclaredBuild(sourceOf(files))).map(
    ({ setting, value, path, file }) => ({ setting, value, path, file }),
  );

const GROOVY = `plugins { id 'java'; id 'com.github.spotbugs' version '6.1.7' }
spotbugs {
    effort = 'max'
    reportLevel = 'low'
    excludeFilter = file('config/spotbugs/exclude.xml')
}
tasks.named('spotbugsTest') { excludeFilter = file('config/spotbugs/tests.xml') }
`;
const KOTLIN = `import com.github.spotbugs.snom.Confidence
import com.github.spotbugs.snom.Effort
spotbugs {
    effort.set(Effort.MORE)
    reportLevel = Confidence.HIGH
    excludeFilter.set(file("$rootDir/config/spotbugs/exclude.xml"))
    onlyAnalyze.set(listOf("com.example.-"))
}
`;
const POM = `<project><build><plugins><plugin>
  <groupId>com.github.spotbugs</groupId><artifactId>spotbugs-maven-plugin</artifactId>
  <configuration>
    <effort>Max</effort><threshold>Low</threshold>
    <excludeFilterFile>\${project.basedir}/spotbugs-exclude.xml,\${spotbugs.shared}</excludeFilterFile>
    <includeFilterFile>include.xml</includeFilterFile>
  </configuration>
</plugin></plugins></build>
<properties><spotbugs.shared>\${maven.multiModuleProjectDirectory}/config/shared.xml</spotbugs.shared></properties>
</project>`;

describe('the SpotBugs settings a build declares', () => {
  it('reads the spotbugs block of a Groovy build, leaving out the test task', () => {
    expect(declarationsOf({ 'build.gradle': GROOVY })).toEqual([
      { setting: 'effort', value: 'max', path: undefined, file: 'build.gradle' },
      { setting: 'threshold', value: 'low', path: undefined, file: 'build.gradle' },
      {
        setting: 'excludeFilter',
        value: undefined,
        path: 'config/spotbugs/exclude.xml',
        file: 'build.gradle',
      },
    ]);
  });

  it('reads the Kotlin DSL of a subproject, with paths against the root or the subproject', () => {
    const found = declarationsOf({
      'app/build.gradle.kts': KOTLIN,
      'lib/build.gradle': "spotbugs.excludeFilter = file('lib-exclude.xml')\n",
    });

    expect(found).toEqual([
      { setting: 'effort', value: 'more', path: undefined, file: 'app/build.gradle.kts' },
      { setting: 'threshold', value: 'high', path: undefined, file: 'app/build.gradle.kts' },
      {
        setting: 'excludeFilter',
        value: undefined,
        path: 'config/spotbugs/exclude.xml',
        file: 'app/build.gradle.kts',
      },
      {
        setting: 'onlyAnalyze',
        value: 'com.example.-',
        path: undefined,
        file: 'app/build.gradle.kts',
      },
      {
        setting: 'excludeFilter',
        value: undefined,
        path: 'lib/lib-exclude.xml',
        file: 'lib/build.gradle',
      },
    ]);
  });

  it('reads spotbugs-maven-plugin with its properties resolved against the module and the root', () => {
    expect(declarationsOf({ 'pom.xml': '<project/>', 'core/pom.xml': POM })).toEqual([
      { setting: 'effort', value: 'max', path: undefined, file: 'core/pom.xml' },
      { setting: 'threshold', value: 'low', path: undefined, file: 'core/pom.xml' },
      { setting: 'includeFilter', value: 'include.xml', path: undefined, file: 'core/pom.xml' },
      {
        setting: 'excludeFilter',
        value: undefined,
        path: 'core/spotbugs-exclude.xml',
        file: 'core/pom.xml',
      },
      {
        setting: 'excludeFilter',
        value: undefined,
        path: 'config/shared.xml',
        file: 'core/pom.xml',
      },
    ]);
  });

  it('leaves a filter path it cannot resolve unresolved', () => {
    const [found] = declarationsOf({
      'build.gradle': 'spotbugs { excludeFilter = file(sharedFilter) }\n',
    });

    expect(found).toEqual({
      setting: 'excludeFilter',
      value: undefined,
      path: undefined,
      file: 'build.gradle',
    });
  });
});

describe('the SpotBugs settings each precedence runs with', () => {
  const declarations = [
    { setting: 'effort', value: 'max', file: 'build.gradle' },
    { setting: 'threshold', value: 'low', file: 'build.gradle' },
    { setting: 'excludeFilter', path: 'x.xml', file: 'build.gradle' },
    { setting: 'includeFilter', value: 'i.xml', file: 'build.gradle' },
  ];

  it('raises effort and threshold when the project wins, and always adds the exclude filters', () => {
    const projectFirst = spotbugsLayers(declarations, { projectWins: true });
    const nitpickerFirst = spotbugsLayers(declarations, { projectWins: false });

    expect(spotbugsArguments(projectFirst, ['/head/x.xml'])).toEqual([
      '-effort:max',
      '-low',
      '-exclude',
      '/head/x.xml',
    ]);
    expect(spotbugsArguments(nitpickerFirst, ['/head/x.xml'])).toEqual([
      '-effort:default',
      '-medium',
      '-exclude',
      '/head/x.xml',
    ]);
    expect(projectFirst.notApplied.map(({ setting }) => setting)).toEqual(['includeFilter']);
    expect(nitpickerFirst.notApplied.map(({ setting }) => setting)).toEqual([
      'effort',
      'threshold',
      'includeFilter',
    ]);
  });

  it('never lowers the effort or raises the threshold, which would drop findings', () => {
    const lowered = spotbugsLayers(
      [
        { setting: 'effort', value: 'min', file: 'pom.xml' },
        { setting: 'threshold', value: 'high', file: 'pom.xml' },
      ],
      { projectWins: true },
    );

    expect(spotbugsArguments(lowered)).toEqual(['-effort:default', '-medium']);
    expect(lowered.notApplied.map(({ value }) => value)).toEqual(['min', 'high']);
  });

  it('takes the highest effort when the build files declare several', () => {
    const layered = spotbugsLayers(
      [
        { setting: 'effort', value: 'more', file: 'a/build.gradle' },
        { setting: 'effort', value: 'max', file: 'b/build.gradle' },
      ],
      { projectWins: true },
    );

    expect(layered.effort).toBe('max');
  });

  it('applies nothing declared under a condition, and names it as not applied', () => {
    const build = `tasks.withType<SpotBugsTask>().configureEach {
  if (name.endsWith("Test")) { excludeFilter.set(file("config/tests.xml")) }
}
spotbugs { when (mode) { "strict" -> effort = 'max' } }
`;
    const declarations = spotbugsDeclarations(
      readDeclaredBuild(sourceOf({ 'build.gradle': build })),
    );
    const layered = spotbugsLayers(declarations, { projectWins: true });

    expect(layered).toMatchObject({ effort: 'default', filters: [] });
    expect(layered.notApplied.map(({ setting }) => setting)).toEqual(['excludeFilter', 'effort']);
  });
});
