import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import { readReportModules } from './report-modules.mjs';

const fakeGradle = path.resolve(import.meta.dirname, '../fixtures/fake-gradle.mjs');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const SOURCES = ['src/main/java/demo/A.java', 'src/main/kotlin/demo/K.kt'];

function withSources(files) {
  const folders = ['', ...(files['modules.txt'] ?? '').split('\n').filter(Boolean)];
  const sources = folders.flatMap((folder) =>
    SOURCES.map((source) => [path.join(folder, source), 'package demo;\n']),
  );
  return { ...Object.fromEntries(sources), ...files };
}

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-modules-'));
  roots.push(root);
  for (const [name, text] of Object.entries(withSources(files))) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const KILLED_MUTANT =
  "<mutations><mutation detected='true' status='KILLED'><sourceFile>A.java</sourceFile><mutatedClass>demo.A</mutatedClass><mutatedMethod>run</mutatedMethod><methodDescription>()V</methodDescription><lineNumber>3</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.VoidMethodCallMutator</mutator><description>removed call</description></mutation></mutations>";

const ROOT_JDEPS = {
  'jdeps-classes.txt': 'demo.a.A\ndemo.c.C\n',
  'jdeps.txt': '   demo.a.A -> demo.c.C main\n',
};

const collect = (root) => collectJavaFindings(root, { gradle: fakeGradle, policy: {} });

describe('a Gradle build with several projects', () => {
  it('reads the findings of every project, with paths from the build root', () => {
    const root = project({
      'modules.txt': 'lib\nservices/billing\n',
      'violations.txt': 'Avoid unused field: added\n',
    });

    const paths = collect(root)
      .filter((finding) => finding.rule === 'UnusedPrivateField')
      .map((finding) => finding.path);

    expect(paths.toSorted()).toEqual([
      'lib/src/main/java/demo/A.java',
      'services/billing/src/main/java/demo/A.java',
      'src/main/java/demo/A.java',
    ]);
  });

  it('keeps project-wide findings of each project apart, the root ones as in a one-project build', () => {
    const root = project({ 'modules.txt': 'lib\n', 'mutations.xml': KILLED_MUTANT });

    const identities = collect(root)
      .filter((finding) => finding.path === '.' && finding.tool === 'pit')
      .map((finding) => finding.identity);

    expect(identities.toSorted()).toEqual(['status:Killed', 'status:Killed@:lib']);
  });

  it('reads the Kotlin reports of every project with the kotlin preset', () => {
    const root = project({ 'modules.txt': 'lib\n', 'detekt.txt': 'Magic number 42\n' });

    const paths = collectJavaFindings(root, { gradle: fakeGradle, policy: { preset: 'kotlin' } })
      .filter((finding) => finding.tool === 'detekt')
      .map((finding) => finding.path);

    expect(paths.toSorted()).toEqual([
      'lib/src/main/kotlin/demo/K.kt',
      'src/main/kotlin/demo/K.kt',
    ]);
  });

  it('counts package dependencies across projects, so a cycle through two projects is one graph', () => {
    const root = project({
      'modules.txt': 'lib\n',
      'src/main/java/demo/a/A.java': 'package demo.a;\n',
      'lib/src/main/java/demo/b/B.java': 'package demo.b;\n',
      'jdeps-classes.txt': 'demo.a.A\n',
      'jdeps.txt': '   demo.a.A -> demo.b.B lib\n',
      'lib/jdeps-classes.txt': 'demo.b.B\n',
      'lib/jdeps.txt': '   demo.b.B -> demo.a.A app\n',
    });

    const coupling = collect(root)
      .filter((finding) => finding.tool === 'coupling')
      .filter(({ identity }) =>
        ['module:totalCoupling', 'package:demo.a:fanIn', 'package:demo.b:fanOut'].includes(
          identity.split('@')[0],
        ),
      )
      .map((finding) => `${finding.path} ${finding.identity} ${String(finding.metric.value)}`);

    expect(coupling.toSorted()).toEqual([
      '. package:demo.a:fanIn 1',
      '. package:demo.b:fanOut 1',
      'lib/src/main/java/demo/b/B.java module:totalCoupling 2',
      'src/main/java/demo/a/A.java module:totalCoupling 2',
    ]);
  });

  it('reads a project without main classes or JaCoCo report as untested', () => {
    const root = project({ 'modules.txt': 'lib\n', NO_JACOCO_IN: 'lib' });

    expect(() => collect(root)).not.toThrow();
  });

  it('gives the root project the same identities with one project or several', () => {
    const rootIdentities = (files) =>
      collect(project({ 'mutations.xml': KILLED_MUTANT, ...ROOT_JDEPS, ...files }))
        .filter((finding) => finding.path === '.' && !finding.identity.includes('@'))
        .map((finding) => `${finding.rule} ${finding.identity}`);

    const identities = rootIdentities({});
    expect(identities.filter((identity) => identity.endsWith(':fanOut'))).toEqual([
      'package-coupling package:demo.a:fanOut',
      'package-coupling package:demo.c:fanOut',
    ]);
    expect(rootIdentities({ 'modules.txt': 'extra\n' })).toEqual(identities);
  });

  it('skips a project with no sources and no classes, which writes no reports', () => {
    const root = project({ 'modules.txt': 'empty\n', EMPTY_MODULES: 'empty' });
    rmSync(path.join(root, 'empty'), { recursive: true });

    expect(collect(root).filter((finding) => finding.path.startsWith('empty/'))).toEqual([]);
  });

  it('names the project whose JaCoCo report is missing, and never the report directory', () => {
    const root = project({ 'modules.txt': 'lib\n', NO_JACOCO_IN: 'lib', MAIN_CLASSES: '' });

    expect(() => collect(root)).toThrow(
      new Error('The java preset found no JaCoCo report for project :lib (lib)'),
    );
  });

  it('fails when no project applies the java plugin, instead of passing with no findings', () => {
    const root = project({ NO_REPORTS: '' });

    expect(() => collect(root)).toThrow(
      'The java preset found no Gradle project that applies the java plugin',
    );
  });

  it('writes the reports outside the project and removes them afterwards', () => {
    const root = project({});

    collect(root);

    const argument = JSON.parse(
      readFileSync(path.join(root, 'build/gradle-args.json'), 'utf8'),
    ).find((value) => value.startsWith('-Pnitpicker.reportDir='));
    const reportDir = argument.slice('-Pnitpicker.reportDir='.length);
    expect(path.relative(root, reportDir).startsWith('..')).toBe(true);
    expect(existsSync(reportDir)).toBe(false);
    expect(existsSync(path.join(root, 'build/nitpicker'))).toBe(false);
  });

  it('names the project whose reports are missing', () => {
    const base = project({
      'modules.json': JSON.stringify([
        { key: 'root', path: ':', dir: '' },
        { key: 'module-lib', path: ':lib', dir: 'lib' },
      ]),
      'root/manifest.json': '{}',
    });

    expect(() => readReportModules(base, 'java')).toThrow(
      'The java preset found no Gradle reports for project :lib (lib): its nitpickerJava task did not run',
    );
  });
});

describe('a failing Gradle run', () => {
  it('keeps the cause and drops the JVM option notices', () => {
    const root = project({
      GRADLE_FAIL: [
        'Picked up JAVA_TOOL_OPTIONS: -Dhttps.proxyHost=127.0.0.1',
        ...Array.from({ length: 300 }, (_, index) => `INFO: step ${String(index)}`),
        'Caused by: org.pitest.help.PitError: Coverage generation minion exited abnormally!',
        ...Array.from({ length: 300 }, (_, index) => `INFO: later ${String(index)}`),
        "Execution failed for task ':nitpickerPit'.",
      ].join('\n'),
    });

    expect(() => collect(root)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Caused by: org.pitest.help.PitError'),
      }),
    );
    expect(() => collect(root)).toThrow(
      expect.not.objectContaining({ message: expect.stringContaining('Picked up') }),
    );
  });
});
