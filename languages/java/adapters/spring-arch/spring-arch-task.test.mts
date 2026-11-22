import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRADLE_DIRECTORY, INIT_SCRIPT } from '../../builds/java-build.mts';
import { parseJson, textOf } from '../../../../shared/values/readers.mts';
import { reportOf } from '../effects/effects-types.mts';

const script = readFileSync(INIT_SCRIPT, 'utf8');

function captured(pattern: RegExp, text: string, group = 1): string {
  return textOf(pattern.exec(text)?.[group]);
}

function linesWith(body: string, ...fragments: readonly string[]): string[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => fragments.some((fragment) => line.includes(fragment)));
}

function gradleScript(relative: string): string {
  return readFileSync(path.join(GRADLE_DIRECTORY, relative), 'utf8');
}

function taskBody(name: string, source = script): string {
  const start = source.indexOf(`tasks.register('${name}'`);
  const lineStart = source.lastIndexOf('\n', start) + 1;
  const indent = ' '.repeat(start - lineStart);
  const end = source.indexOf(`\n${indent}}\n`, start);
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

describe('nitpickerSpringArch in the init script', () => {
  it('runs as part of nitpickerJava', () => {
    const dependsOn = [
      ...taskBody('nitpickerJava').matchAll(/dependsOn ((?:'[^'\n]+',\s*)*'[^'\n]+')/gu),
    ].flatMap(([, names = '']) =>
      names.split(/,\s*/u).map((task: string) => task.replaceAll("'", '')),
    );

    expect(dependsOn).toEqual([
      'nitpickerPmd',
      'nitpickerSpotbugs',
      'nitpickerErrorProne',
      'nitpickerFormat',
      'nitpickerArchunit',
      'nitpickerSpringArch',
      'nitpickerStructure',
      'nitpickerJacoco',
      'nitpickerPit',
    ]);
  });

  it('runs for Spring or jMolecules projects and for projects with a feature folder, so other projects skip it', () => {
    expect(captured(/onlyIf \{[^}]*\}/, taskBody('nitpickerSpringArch'), 0)).toBe(
      'onlyIf { runsArchRules() }',
    );
    expect(captured(/def runsArchRules = (.+)/, script, 1)).toBe(
      '{ usesSpring() || usesJmolecules() || featureFoldersDeclared }',
    );
    expect(captured(/def featureFoldersDeclared = (.+)/, script, 1)).toBe(
      "nitpickerArgument('nitpicker.featureFolders') == 'true'",
    );
  });

  it('skips when neither main nor test output has compiled classes and writes an empty spring-arch.json', () => {
    const body = taskBody('nitpickerSpringArch');
    const secondOnlyIf = body.indexOf('onlyIf {', body.indexOf('onlyIf {') + 1);
    const guard = body.slice(secondOnlyIf, body.indexOf('def ruleSources', secondOnlyIf));

    expect(secondOnlyIf).toBeGreaterThan(-1);
    expect(
      linesWith(
        guard,
        'hasClassFiles(classDirs)',
        "reportDir.get().file('spring-arch.json').asFile.text =",
      ),
    ).toEqual([
      'if (hasClassFiles(classDirs)) {',
      'reportDir.get().file(\'spring-arch.json\').asFile.text = \'{"root":"","violations":[]}\\n\'',
    ]);
  });

  it('tells the reader through the manifest that the rules ran', () => {
    expect(captured(/springArch\s*: ([^,\n]+)/, taskBody('nitpickerJava'), 1)).toBe(
      'runsArchRules()',
    );
  });

  it('resolves the pinned ArchUnit version', () => {
    expect(captured(/archunit\s*: '([^']+)'/, script, 1)).toBe('1.5.1');
    expect(captured(/nitpickerSpringArch "([^"]+)"/, script, 1)).toBe(
      `com.tngtech.archunit:archunit:$\{pinned.archunit}`,
    );
  });
});

describe('empty-project onlyIf skips across Gradle analysis tasks', () => {
  it('tightens PMD, Checkstyle config, structure, jdeps, and JaCoCo skips in the init script', () => {
    const pmd = taskBody('nitpickerPmd');
    expect(
      linesWith(pmd, 'if (!javaFiles().isEmpty())', '\'{"version":"2.1.0","runs":[]}\''),
    ).toEqual([
      'if (!javaFiles().isEmpty()) {',
      'reportDir.get().file(\'pmd.sarif\').asFile.text = \'{"version":"2.1.0","runs":[]}\'',
    ]);

    const checkstyleConfig = taskBody('nitpickerCheckstyleConfig');
    expect(linesWith(checkstyleConfig, 'onlyIf { exportedCheckstyleConfig')).toEqual([
      'onlyIf { exportedCheckstyleConfig != null || (!mergedCheckstyleConfig && !javaFiles().isEmpty()) }',
    ]);

    const structure = taskBody('nitpickerStructure');
    expect(
      linesWith(
        structure,
        'hasJavaFilesIn(lintedMainDirs())',
        "file('structure.json')",
        "file('classes.json')",
      ),
    ).toEqual([
      'if (hasJavaFilesIn(lintedMainDirs())) {',
      "reportDir.get().file('structure.json').asFile.text = '[]'",
      'reportDir.get().file(\'classes.json\').asFile.text = \'{"files":{},"classes":[]}\'',
      "def output = reportDir.get().file('structure.json').asFile",
      "def classesOutput = reportDir.get().file('classes.json').asFile",
    ]);

    const jdeps = taskBody('nitpickerJdeps');
    expect(linesWith(jdeps, 'hasClassFiles(classDirs)', "'jdeps.txt'")).toEqual([
      'if (hasClassFiles(classDirs)) {',
      "['jdeps.txt', 'jdeps-test.txt', 'jdeps-classes.txt'].each { name ->",
      "reportDir.get().file('jdeps.txt').asFile.withWriter('UTF-8') { mainEdges ->",
    ]);

    const jacoco = taskBody('nitpickerJacoco');
    expect(linesWith(jacoco, 'onlyIf')).toEqual([
      'onlyIf { !testsFailed && hasClassFiles(sourceSets.main.output.classesDirs.files) }',
    ]);
  });

  it('skips lint, CPD, dependencies, Error Prone, and detekt layers on empty projects', () => {
    const lint = taskBody('nitpickerLint', gradleScript('tasks/lint-tasks.gradle'));
    expect(linesWith(lint, 'onlyIf', "include '**/*.java'", "include '**/*.class'")).toEqual([
      'onlyIf {',
      "sets.any { !it.allJava.matching { include '**/*.java' }.isEmpty() } ||",
      "it.exists() && !project.fileTree(it) { include '**/*.class' }.isEmpty()",
    ]);

    const cpd = taskBody('nitpickerCpd', gradleScript('tasks/cpd-task.gradle'));
    expect(linesWith(cpd, 'onlyIf', "include '**/*.java'", '.asFile.delete()')).toEqual([
      "inputs.files({ sourceDirectories().collect { project.fileTree(it) { include '**/*.java' } } })",
      'onlyIf {',
      "if (sourceDirectories().any { !project.fileTree(it) { include '**/*.java' }.isEmpty() }) {",
      'report.get().asFile.delete()',
      'failure.get().asFile.delete()',
      'skipped.get().asFile.delete()',
      'report.get().asFile.delete()',
      'failure.get().asFile.delete()',
      'skipped.get().asFile.delete()',
      'report.get().asFile.delete()',
    ]);

    const deps = taskBody('nitpickerDependencies', gradleScript('tasks/dependency-tasks.gradle'));
    expect(linesWith(deps, 'onlyIf', "include '**/*.class'")).toEqual([
      'onlyIf {',
      "it.exists() && !project.fileTree(it) { include '**/*.class' }.isEmpty()",
    ]);

    const errorProne = taskBody(
      'nitpickerErrorProne',
      gradleScript('errorprone/error-prone.gradle'),
    );
    expect(
      linesWith(
        errorProne,
        'onlyIf',
        'compileTasks().values()',
        "'errorprone-skipped.txt'",
        'report.text = ',
      ),
    ).toEqual([
      'onlyIf {',
      'if (!compileTasks().values().every { it.source.isEmpty() }) {',
      "new File(report.parentFile, 'errorprone-skipped.txt').delete()",
      "report.text = '[]\\n'",
      "def skipped = new File(report.parentFile, 'errorprone-skipped.txt')",
      "report.text = '[]\\n'",
      "report.text = '[]\\n'",
    ]);

    const detektLayers = taskBody(
      'nitpickerDetektLayers',
      gradleScript('kotlin/kotlin-detekt.gradle'),
    );
    expect(linesWith(detektLayers, 'onlyIf')).toEqual([
      'onlyIf { !kotlinLintedDirs().isEmpty() && detekt.enabled() }',
    ]);
  });

  it('skips nitpickerEffects with an empty effects.json matching the effects reader schema', () => {
    const effects = taskBody(
      'nitpickerEffects',
      gradleScript('tasks/analysis/effects-task.gradle'),
    );
    expect(linesWith(effects, 'onlyIf', 'classesDirs.files.any')).toEqual([
      'onlyIf {',
      'if (sourceSets.main.output.classesDirs.files.any { it.exists() && it.list()?.length }) {',
    ]);
    const [, head = '', tail = ''] =
      /new File\(directory, 'effects\.json'\)\.text =\s*\n\s*'([^']+)' \+\s*\n\s*'([^']+)'/u.exec(
        effects,
      ) ?? [];
    const parsed = reportOf(parseJson(`${head}${tail}`.replace(/\\n$/u, '\n')));

    expect(parsed).toEqual({
      classes: 0,
      skipped: 0,
      unreadableLibraries: 0,
      degraded: { oversizedMethods: 0, timeBudgetExceeded: false },
      unresolved: { supertypes: 0, total: 0 },
      unavailable: undefined,
      violations: [],
      covered: [],
    });
  });
});
