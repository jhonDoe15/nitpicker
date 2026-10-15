import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from './java-diff.mjs';

// Runs KotlinMetrics.java, the PSI program behind Kotlin structure, CRAP and coupling, on source
// files. It needs Java 21, Gradle and network access to Maven Central (for the Kotlin compiler the
// init script pins), so it only runs with NITPICKER_KOTLIN_E2E=1 (`npm run test:kotlin`). A bump
// of `kotlinCompiler` in the init script is checked by this test.

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const pinned = /kotlinCompiler\s*:\s*'([^']+)'/.exec(readFileSync(INIT_SCRIPT, 'utf8'))[1];
const metricsSource = path.resolve(import.meta.dirname, '../gradle/KotlinMetrics.java');

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

const UNITS = `package demo.units

fun plain(a: Int, b: Int): Int {
    if (a > 0 && b > 0 || a < -5) {
        return a
    }
    return b ?: 0
}

fun Int.double(): Int = this * 2

inline fun twice(block: () -> Unit) {
    block()
    block()
}

class Holder(private val start: Int) {
    constructor() : this(0) {
        println("default")
    }

    init {
        println("init")
    }

    val doubled: Int
        get() = start * 2

    val combine: (Int, Int, Int, Int) -> Int = { a, b, c, d ->
        if (a > b) c else d
    }

    val cached by lazy {
        val values = listOf(1, 2)
        values.sum()
    }

    val anonymous = fun(x: Int): Int {
        return x + 1
    }

    val eager = run {
        println("eager")
        1
    }

    abstract class Nested {
        abstract fun missing()
    }
}
`;

const FLAT = 'package demo.flat\n\nfun flat() = 1\n';
const BOM = '﻿package demo.bom\n\nfun bom() = 1\n';
const ROOT_PACKAGE = 'fun root() = 1\n';
const MULTIFILE_A =
  '@file:JvmName("Mf")\n@file:JvmMultifileClass\n\npackage demo.mf\n\nfun partA() = 1\n';
const MULTIFILE_B =
  '@file:JvmName("Mf")\n@file:JvmMultifileClass\n\npackage demo.mf\n\nfun partB() = 2\n';
const CRLF = 'package demo.crlf\r\n\r\nfun crlf(): Int {\r\n    return 1\r\n}\r\n';
const BROKEN = 'package demo.broken\n\nclass Broken {\n    fun incomplete(: Int\n}\n';

let workspace;
let java;
let classpath;

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
    { cwd: project, encoding: 'utf8', timeout: 15 * 60 * 1000 },
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
      classpath,
      metricsSource,
      output,
      project,
      'src',
    ],
    { cwd: project, encoding: 'utf8', timeout: 5 * 60 * 1000 },
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
        ({ name, start, end, statements, parameters, complexity, inline }) =>
          `${name} ${start}-${end} s${statements} p${parameters} c${complexity}${inline ? ' inline' : ''}`,
      ),
    ).toEqual([
      'plain 3-8 s3 p2 c5',
      'Int.double 10-10 s1 p0 c1',
      'twice 12-15 s2 p1 c1 inline',
      'Holder.Holder 18-20 s1 p0 c1',
      'Holder.doubled.get 27-27 s1 p0 c1',
      'Holder.combine 29-31 s3 p4 c2',
      'Holder.cached 33-36 s2 p0 c1',
      'Holder.anonymous 38-40 s1 p1 c1',
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
        '^src\\/Broken\\.kt:(\\d+): .*The sources compile, so the p',
        'inned Kotlin compiler (\\S+) is too old to read them: bu',
        'mp kotlinCompiler in nitpicker\\.init\\.gradle\\.$',
      ].join(''),
      'm',
    ).exec(log);
    expect([status, line, version]).toEqual([1, '4', pinned]);
  });
});
