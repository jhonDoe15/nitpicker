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
    expect(guard).toContain('hasClassFiles(classDirs)');
    expect(guard).toContain("reportDir.get().file('spring-arch.json').asFile.text =");
    expect(guard).toContain('\'{"root":"","violations":[]}\\n\'');
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
    expect(pmd).toContain('if (!javaFiles().isEmpty())');
    expect(pmd).toContain('\'{"version":"2.1.0","runs":[]}\'');

    const checkstyleConfig = taskBody('nitpickerCheckstyleConfig');
    expect(checkstyleConfig).toContain(
      'onlyIf { exportedCheckstyleConfig != null || (!mergedCheckstyleConfig && !javaFiles().isEmpty()) }',
    );

    const structure = taskBody('nitpickerStructure');
    expect(structure).toContain('if (hasJavaFilesIn(lintedMainDirs()))');
    expect(structure).toContain("reportDir.get().file('structure.json').asFile.text = '[]'");
    expect(structure).toContain(
      'reportDir.get().file(\'classes.json\').asFile.text = \'{"files":{},"classes":[]}\'',
    );

    const jdeps = taskBody('nitpickerJdeps');
    expect(jdeps).toContain('if (hasClassFiles(classDirs))');
    expect(jdeps).toContain("['jdeps.txt', 'jdeps-test.txt', 'jdeps-classes.txt']");

    const jacoco = taskBody('nitpickerJacoco');
    expect(jacoco).toContain(
      'onlyIf { !testsFailed && hasClassFiles(sourceSets.main.output.classesDirs.files) }',
    );
  });

  it('skips lint, CPD, dependencies, Error Prone, and detekt layers on empty projects', () => {
    const lint = taskBody('nitpickerLint', gradleScript('tasks/lint-tasks.gradle'));
    expect(lint).toContain('onlyIf {');
    expect(lint).toContain("include '**/*.java'");
    expect(lint).toContain("include '**/*.class'");

    const cpd = taskBody('nitpickerCpd', gradleScript('tasks/cpd-task.gradle'));
    expect(cpd).toContain('onlyIf {');
    expect(cpd).toContain("include '**/*.java'");
    expect(cpd).toContain('failure.get().asFile.delete()');
    expect(cpd).toContain('skipped.get().asFile.delete()');

    const deps = taskBody('nitpickerDependencies', gradleScript('tasks/dependency-tasks.gradle'));
    expect(deps).toContain('onlyIf {');
    expect(deps).toContain("include '**/*.class'");

    const errorProne = taskBody(
      'nitpickerErrorProne',
      gradleScript('errorprone/error-prone.gradle'),
    );
    expect(errorProne).toContain('onlyIf {');
    expect(errorProne).toContain('compileTasks().values().every { it.source.isEmpty() }');
    expect(errorProne).toContain("new File(report.parentFile, 'errorprone-skipped.txt').delete()");
    expect(errorProne).toContain("report.text = '[]\\n'");

    const detektLayers = taskBody(
      'nitpickerDetektLayers',
      gradleScript('kotlin/kotlin-detekt.gradle'),
    );
    expect(detektLayers).toContain('onlyIf { !kotlinLintedDirs().isEmpty() && detekt.enabled() }');
  });

  it('skips nitpickerEffects with an empty effects.json matching the effects reader schema', () => {
    const effects = taskBody(
      'nitpickerEffects',
      gradleScript('tasks/analysis/effects-task.gradle'),
    );
    expect(effects).toContain('onlyIf {');
    expect(effects).toContain(
      'sourceSets.main.output.classesDirs.files.any { it.exists() && it.list()?.length }',
    );
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
