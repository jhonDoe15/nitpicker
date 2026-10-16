import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  gradleClasspath,
  pinnedKotlinCompiler,
  runPsiProgram,
  writeSources,
} from './kotlin-psi/test-support/psi-program.mjs';
import {
  BOM,
  BROKEN,
  CRLF,
  FLAT,
  INITIALIZERS,
  MULTIFILE_A,
  MULTIFILE_B,
  NESTING,
  ROOT_PACKAGE,
  UNITS,
} from './test-support/kotlin-metrics-sources.mjs';

// Runs KotlinMetrics.java, the PSI program behind Kotlin structure, CRAP and coupling, on source
// files. It needs Java 21, Gradle and network access to Maven Central (for the Kotlin compiler the
// init script pins), so it only runs with NITPICKER_KOTLIN_E2E=1 (`npm run test:kotlin`). A bump
// of `kotlinCompiler` in the init script is checked by this test.

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const pinned = pinnedKotlinCompiler;
const metricsSource = path.resolve(import.meta.dirname, '../gradle/KotlinMetrics.java');

const FORCE_OTHER_KOTLIN = `
configurations.matching { it.name == "nitpickerKotlinCompiler" }.configureEach {
    resolutionStrategy.eachDependency {
        if (requested.group == "org.jetbrains.kotlin") {
            useVersion("1.9.25")
        }
    }
}
`;

let workspace;
let java;
let classpath;

function measure(project) {
  const { status, log, result } = runPsiProgram({
    java,
    classpath,
    source: metricsSource,
    project,
  });
  return { status, log, metrics: result };
}

describe.skipIf(!enabled)('KotlinMetrics on source files', () => {
  beforeAll(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-metrics-'));
    const project = path.join(workspace, 'project');
    cpSync(path.resolve(import.meta.dirname, 'fixtures/kotlin-project'), project, {
      recursive: true,
    });
    writeFileSync(
      path.join(project, 'build.gradle.kts'),
      `${readFileSync(path.join(project, 'build.gradle.kts'), 'utf8')}${FORCE_OTHER_KOTLIN}`,
    );
    ({ javaHome: java, classpath } = gradleClasspath({ gradle, project, workspace }));
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('resolves the pinned compiler although the project forces another Kotlin version', () => {
    const jars = classpath.split(path.delimiter).map((jar) => path.basename(jar));

    expect(jars.filter((jar) => jar.startsWith('kotlin-compiler-embeddable'))).toEqual([
      `kotlin-compiler-embeddable-${pinned}.jar`,
    ]);
    expect(jars.filter((jar) => /1\.9\.25/.test(jar))).toEqual([]);
  });

  it('measures the units of a file and leaves out what is not a unit', () => {
    const { metrics } = measure(writeSources(workspace, 'units', { 'src/Units.kt': UNITS }));

    expect(
      metrics.functions.map(
        ({ name, start, end, statements, parameters, complexity, inline, initializer }) =>
          `${name} ${start}-${end} s${statements} p${parameters} c${complexity}${inline ? ' inline' : ''}${initializer ? ' initializer' : ''}`,
      ),
    ).toEqual([
      'plain 3-8 s3 p2 c5',
      'Int.double 10-10 s1 p0 c1',
      'twice 12-15 s2 p1 c1 inline',
      'Holder.Holder 18-20 s1 p0 c1',
      'Holder.<init> 22-24 s1 p0 c1 initializer',
      'Holder.doubled.get 27-27 s1 p0 c1',
      'Holder.combine 29-31 s3 p4 c2',
      'Holder.cached 33-36 s2 p0 c1',
      'Holder.anonymous 38-40 s1 p1 c1',
      'Holder.eager 42-45 s3 p0 c1 initializer',
    ]);
  });

  it('measures init blocks and property initializers that hold a block or branch, and leaves out the straight-line ones', () => {
    const { metrics } = measure(
      writeSources(workspace, 'initializers', { 'src/Init.kt': INITIALIZERS }),
    );

    expect(
      metrics.functions.map(
        ({ name, start, end, statements, parameters, complexity, initializer }) =>
          `${name} ${start}-${end} s${statements} p${parameters} c${complexity}${initializer ? ' initializer' : ''}`,
      ),
    ).toEqual([
      'Boot.<init> 9-12 s2 p0 c1 initializer',
      'Boot.label 16-16 s1 p0 c2 initializer',
      'Boot.table 18-18 s2 p0 c1 initializer',
      'Boot.chosen 20-24 s1 p0 c3 initializer',
      'Boot.observed 26-28 s1 p3 c1',
      'Boot.<anonymous>.run 31-33 s1 p0 c1',
      'Boot.<anonymous>.<init> 35-37 s1 p0 c1 initializer',
      'Boot.Companion.registry 41-41 s2 p0 c1 initializer',
      'Boot.Companion.<init> 43-45 s1 p0 c1 initializer',
      'Single.<init> 50-52 s1 p0 c1 initializer',
      'top 55-55 s2 p0 c1 initializer',
    ]);
  });

  it('counts a flat if / else if / else chain as one level and an if inside an else block or a branch as one deeper', () => {
    const { metrics } = measure(writeSources(workspace, 'nesting', { 'src/Nesting.kt': NESTING }));

    expect(
      metrics.functions.map(
        ({ name, maxControlNesting, complexity }) => `${name} n${maxControlNesting} c${complexity}`,
      ),
    ).toEqual([
      'chain n1 c4',
      'inElseBlock n2 c3',
      'inBranch n2 c5',
      'withWhen n2 c4',
      'inLoop n2 c4',
    ]);
  });

  it('lists the package and classes of each file, including a file outside its package directory', () => {
    const { metrics } = measure(
      writeSources(workspace, 'files', {
        'src/Flat.kt': FLAT,
        'src/Root.kt': ROOT_PACKAGE,
        'src/Units.kt': UNITS,
      }),
    );

    expect(metrics.files).toEqual([
      { file: 'src/Flat.kt', package: 'demo.flat', classes: ['demo.flat.FlatKt'] },
      { file: 'src/Root.kt', package: '', classes: ['RootKt'] },
      {
        file: 'src/Units.kt',
        package: 'demo.units',
        classes: ['demo.units.Holder', 'demo.units.UnitsKt'],
      },
    ]);
  });

  it('reads a file with a byte order mark and one with Windows line endings', () => {
    const { metrics } = measure(
      writeSources(workspace, 'encoding', { 'src/Bom.kt': BOM, 'src/Crlf.kt': CRLF }),
    );

    expect(metrics.files.map(({ package: name, classes }) => [name, classes])).toEqual([
      ['demo.bom', ['demo.bom.BomKt']],
      ['demo.crlf', ['demo.crlf.CrlfKt']],
    ]);
    expect(metrics.functions.map(({ name, start, end }) => `${name} ${start}-${end}`)).toEqual([
      'bom 3-3',
      'crlf 3-5',
    ]);
  });

  it('gives each part of a multifile class its own class and the first file the facade', () => {
    const { metrics } = measure(
      writeSources(workspace, 'multifile', {
        'src/MfA.kt': MULTIFILE_A,
        'src/MfB.kt': MULTIFILE_B,
      }),
    );

    expect(metrics.files.map(({ file, classes }) => [file, classes])).toEqual([
      ['src/MfA.kt', ['demo.mf.Mf__MfAKt', 'demo.mf.Mf']],
      ['src/MfB.kt', ['demo.mf.Mf__MfBKt']],
    ]);
  });

  it('fails on a syntax error, naming the file, the line and the pinned compiler', () => {
    const { status, log } = measure(writeSources(workspace, 'broken', { 'src/Broken.kt': BROKEN }));

    const [, line, version] = new RegExp(
      [
        "^src\\/Broken\\.kt:(\\d+): .*The sources compile, so Nitpicker's Kotlin compiler (\\S+)",
        ' is older than the Kotlin of this project: upgrade Nitpicker\\.$',
      ].join(''),
      'm',
    ).exec(log);
    expect([status, line, version]).toEqual([1, '4', pinned]);
  });
});
