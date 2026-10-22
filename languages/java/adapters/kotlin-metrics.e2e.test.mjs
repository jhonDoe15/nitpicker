import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../builds/java-build.mjs';
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
const pinned = /kotlinCompiler\s*:\s*'([^']+)'/.exec(readFileSync(INIT_SCRIPT, 'utf8'))[1];
const metricsSource = path.resolve(import.meta.dirname, '../gradle/KotlinMetrics.java');
const supportSource = path.resolve(import.meta.dirname, '../gradle/MetricsSupport.java');

const PRINT_CLASSPATH = `allprojects {
    plugins.withId('org.jetbrains.kotlin.jvm') {
        tasks.register('printKotlinCompiler') {
            doLast {
                println 'JAVA_HOME=' + System.getProperty('java.home')
                println 'CLASSPATH=' + configurations.nitpickerKotlinCompiler.asPath
            }
        }
    }
}
`;

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
let support;

function gradleClasspath(project) {
  const script = path.join(workspace, 'print.init.gradle');
  writeFileSync(script, PRINT_CLASSPATH);
  const result = spawnSync(
    gradle,
    [
      '--console=plain',
      '--quiet',
      '--no-configuration-cache',
      '-Pnitpicker.kotlin=true',
      '-I',
      INIT_SCRIPT,
      '-I',
      script,
      'printKotlinCompiler',
    ],
    { cwd: project, encoding: 'utf8', timeout: 180_000 },
  );
  expect(result.status, result.stderr).toBe(0);
  const lines = result.stdout.split('\n');
  const valueOf = (key) => lines.find((line) => line.startsWith(`${key}=`)).slice(key.length + 1);
  return { javaHome: valueOf('JAVA_HOME'), classpath: valueOf('CLASSPATH') };
}

function writeSources(name, files) {
  const dir = path.join(workspace, name);
  for (const [relative, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
    writeFileSync(path.join(dir, relative), content);
  }
  return dir;
}

function measure(project) {
  const output = path.join(project, 'metrics.json');
  const result = spawnSync(
    path.join(java, 'bin/java'),
    [
      `-Dnitpicker.kotlinCompiler=${pinned}`,
      '-cp',
      [support, classpath].join(path.delimiter),
      metricsSource,
      output,
      project,
      'src',
    ],
    { cwd: project, encoding: 'utf8', timeout: 180_000 },
  );
  return {
    status: result.status,
    log: result.stdout + result.stderr,
    metrics: result.status === 0 ? JSON.parse(readFileSync(output, 'utf8')) : undefined,
  };
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
    ({ javaHome: java, classpath } = gradleClasspath(project));
    support = path.join(workspace, 'metrics-support');
    const compiled = spawnSync(
      path.join(java, 'bin/javac'),
      ['-proc:none', '-d', support, supportSource],
      { encoding: 'utf8', timeout: 180_000 },
    );
    expect(compiled.status, compiled.stderr).toBe(0);
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
    const { metrics } = measure(writeSources('units', { 'src/Units.kt': UNITS }));

    expect(
      metrics.functions.map(
        ({ name, start, end, statements, parameters, complexity, inline, initializer, lambda }) =>
          [
            `${name} ${start}-${end} s${statements} p${parameters} c${complexity}`,
            inline ? ' inline' : '',
            initializer ? ' initializer' : '',
            lambda ? ' lambda' : '',
          ].join(''),
      ),
    ).toEqual([
      'plain 3-8 s3 p2 c5',
      'Int.double 10-10 s1 p0 c1',
      'twice 12-16 s3 p1 c1 inline',
      'twice.inside 13-13 s1 p0 c1 inline lambda',
      'callbacks 18-25 s4 p1 c1',
      'callbacks.scale 19-19 s3 p1 c2 lambda',
      'callbacks.clamp 20-22 s1 p1 c3 lambda',
      'callbacks.named 23-23 s1 p1 c1 lambda',
      'callbacks.<lambda> 24-24 s3 p1 c2 lambda',
      'Holder.Holder 28-30 s1 p0 c1',
      'Holder.<init> 32-34 s1 p0 c1 initializer',
      'Holder.doubled.get 37-37 s1 p0 c1',
      'Holder.combine 39-41 s3 p4 c2 lambda',
      'Holder.cached 43-46 s2 p0 c1 lambda',
      'Holder.anonymous 48-50 s1 p1 c1 lambda',
      'Holder.eager 52-55 s2 p0 c1 lambda',
    ]);
  });

  it('measures init blocks and property initializers that branch, every lambda as a unit of its own, and leaves out the straight-line initializers', () => {
    const { metrics } = measure(writeSources('initializers', { 'src/Init.kt': INITIALIZERS }));

    expect(
      metrics.functions.map(
        ({ name, start, end, statements, parameters, complexity, initializer, lambda }) =>
          `${name} ${start}-${end} s${statements} p${parameters} c${complexity}${initializer ? ' initializer' : ''}${lambda ? ' lambda' : ''}`,
      ),
    ).toEqual([
      'Boot.<init> 9-12 s2 p0 c1 initializer',
      'Boot.label 16-16 s1 p0 c2 initializer',
      'Boot.table 18-18 s1 p1 c1 lambda',
      'Boot.chosen 20-24 s1 p0 c3 initializer',
      'Boot.observed 26-28 s1 p3 c1 lambda',
      'Boot.<anonymous>.run 31-33 s1 p0 c1',
      'Boot.<anonymous>.<init> 35-37 s1 p0 c1 initializer',
      'Boot.Companion.registry 41-41 s1 p0 c1 lambda',
      'Boot.Companion.<init> 43-45 s1 p0 c1 initializer',
      'Single.<init> 50-52 s1 p0 c1 initializer',
      'top 55-55 s1 p0 c1 lambda',
    ]);
  });

  it('counts a flat if / else if / else chain as one level and an if inside an else block or a branch as one deeper', () => {
    const { metrics } = measure(writeSources('nesting', { 'src/Nesting.kt': NESTING }));

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
      writeSources('files', {
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
      writeSources('encoding', { 'src/Bom.kt': BOM, 'src/Crlf.kt': CRLF }),
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
      writeSources('multifile', { 'src/MfA.kt': MULTIFILE_A, 'src/MfB.kt': MULTIFILE_B }),
    );

    expect(metrics.files.map(({ file, classes }) => [file, classes])).toEqual([
      ['src/MfA.kt', ['demo.mf.Mf__MfAKt', 'demo.mf.Mf']],
      ['src/MfB.kt', ['demo.mf.Mf__MfBKt']],
    ]);
  });

  it('fails on a syntax error, naming the file, the line and the pinned compiler', () => {
    const { status, log } = measure(writeSources('broken', { 'src/Broken.kt': BROKEN }));

    const [, line, version] = new RegExp(
      [
        '^src\\/Broken\\.kt:(\\d+): .*The sources compile, so the pinned Kotlin compiler (\\S+)',
        ' is too old to read them: bump kotlinCompiler in nitpicker\\.init\\.gradle\\.$',
      ].join(''),
      'm',
    ).exec(log);
    expect([status, line, version]).toEqual([1, '4', pinned]);
  });
});
