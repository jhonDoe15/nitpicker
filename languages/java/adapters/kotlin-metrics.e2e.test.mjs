import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../builds/java-build.mjs';
import { loadEffectFindings } from './kotlin/review-rules/main/load-effects.mjs';
import { findingFactory } from './kotlin/review-rules/review-finding.mjs';
import {
  BOM,
  BROKEN,
  CRLF,
  DEEP_CHAIN,
  FLAT,
  INITIALIZERS,
  LOAD_EFFECTS,
  MULTIFILE_A,
  MULTIFILE_B,
  NESTING,
  PREDICATE_SYMBOLS,
  ROOT_PACKAGE,
  UNITS,
} from './test-support/kotlin-metrics-sources.mjs';

// Compiles and runs kotlin-psi, the PSI program behind Kotlin structure, CRAP, coupling and the
// review rules, on source files. It needs Java 21, Gradle and network access to Maven Central (for
// the Kotlin compiler the init script pins), so it only runs with NITPICKER_KOTLIN_E2E=1 (`npm run test:kotlin`). A bump
// of `kotlinCompiler` in the init script is checked by this test.

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const pinned = /kotlinCompiler\s*:\s*'([^']+)'/.exec(readFileSync(INIT_SCRIPT, 'utf8'))[1];
const psiSources = path.resolve(import.meta.dirname, '../gradle/kotlin-psi');

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

const fixtureBuild = readFileSync(
  path.resolve(import.meta.dirname, 'fixtures/kotlin-project/build.gradle.kts'),
  'utf8',
);
const kotlinPlugin = /kotlin\("jvm"\) version "([^"]+)"/u.exec(fixtureBuild)[1];
const MODULE_BUILD = [
  'plugins {\n    kotlin("jvm")\n}\n',
  'repositories {\n    mavenCentral()\n}\n',
  'kotlin {\n    jvmToolchain(21)\n}\n',
].join('\n');
const PSI_CLASS = 'nitpicker/kotlinpsi/KotlinPsi.class';

let workspace;
let java;
let classpath;
let classes;

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

function twoModuleProject() {
  return writeSources('modules', {
    'settings.gradle.kts': 'rootProject.name = "modules"\ninclude("one", "two")\n',
    'build.gradle.kts': `plugins {\n    kotlin("jvm") version "${kotlinPlugin}" apply false\n}\n`,
    'one/build.gradle.kts': MODULE_BUILD,
    'two/build.gradle.kts': MODULE_BUILD,
    'one/src/main/kotlin/One.kt': 'package demo.one\n\nfun one() = 1\n',
    'two/src/main/kotlin/Two.kt': 'package demo.two\n\nfun two() = 2\n',
  });
}

function runPsiTasks(project, options = []) {
  return spawnSync(
    gradle,
    [
      '--console=plain',
      '--quiet',
      '--no-configuration-cache',
      '--parallel',
      '-Pnitpicker.kotlin=true',
      '-I',
      INIT_SCRIPT,
      ...options,
      ':one:nitpickerKotlinPsi',
      ':two:nitpickerKotlinPsi',
    ],
    { cwd: project, encoding: 'utf8', timeout: 170_000 },
  );
}

function functionsOf(project, module) {
  const report = path.join(project, module, 'build/nitpicker/kotlin-metrics.json');
  return JSON.parse(readFileSync(report, 'utf8')).functions.map(({ name }) => name);
}

function compilePsiProgram() {
  const output = path.join(workspace, 'psi-classes');
  const sources = readdirSync(psiSources, { recursive: true })
    .filter((entry) => entry.endsWith('.java'))
    .map((entry) => path.join(psiSources, entry));
  const result = spawnSync(
    path.join(java, 'bin/javac'),
    ['-proc:none', '-d', output, '-cp', classpath, ...sources],
    { encoding: 'utf8', timeout: 180_000 },
  );
  expect(result.status, result.stderr).toBe(0);
  return output;
}

function measure(project, roots = ['src']) {
  const metricsOutput = path.join(project, 'metrics.json');
  const factsOutput = path.join(project, 'facts.json');
  const result = spawnSync(
    path.join(java, 'bin/java'),
    [
      `-Dnitpicker.kotlinCompiler=${pinned}`,
      '-cp',
      `${classpath}${path.delimiter}${classes}`,
      'nitpicker.kotlinpsi.KotlinPsi',
      metricsOutput,
      factsOutput,
      project,
      ...roots,
    ],
    { cwd: project, encoding: 'utf8', timeout: 180_000 },
  );
  return {
    status: result.status,
    log: result.stdout + result.stderr,
    metrics: result.status === 0 ? JSON.parse(readFileSync(metricsOutput, 'utf8')) : undefined,
    facts: result.status === 0 ? JSON.parse(readFileSync(factsOutput, 'utf8')) : undefined,
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
    classes = compilePsiProgram();
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
      { file: 'src/Flat.kt', package: 'demo.flat', classes: ['demo.flat.FlatKt'], imports: [] },
      { file: 'src/Root.kt', package: '', classes: ['RootKt'], imports: [] },
      {
        file: 'src/Units.kt',
        package: 'demo.units',
        classes: ['demo.units.Holder', 'demo.units.UnitsKt'],
        imports: [],
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

  it('reads a source file nested far deeper than the default stack allows', () => {
    const { status, log, metrics, facts } = measure(
      writeSources('deep', { 'src/Deep.kt': DEEP_CHAIN }),
    );

    expect([status, log.includes('StackOverflow')]).toEqual([0, false]);
    expect(metrics.functions[0].name).toBe('nested');
    expect(facts.files.map(({ file }) => file)).toEqual(['src/Deep.kt']);
  });

  it('names a predicate in a property initializer after the property and keeps backticked constants', () => {
    const { facts } = measure(writeSources('symbols', { 'src/Symbols.kt': PREDICATE_SYMBOLS }));
    const [symbols] = facts.files;

    expect(symbols.classes.find(({ name }) => name === 'Phase').entries).toEqual([
      'NEW',
      'in',
      'DONE',
    ]);
    expect(
      symbols.predicates.map(
        ({ symbol, comparisons }) =>
          `${symbol}: ${comparisons.map(({ right }) => right).join(' ')}`,
      ),
    ).toEqual([
      'Holder.k: Phase.NEW Phase.DONE',
      'Holder.g: Phase.NEW Phase.`in`',
      'Holder.l: Phase.NEW Phase.DONE',
      'Holder.f: Phase.`in` Phase.DONE',
      'isStart: Phase.NEW Phase.`in`',
    ]);
  });

  it('collects the calls that run while a file or object loads, and the rule reports their effects', () => {
    const { facts } = measure(writeSources('load', { 'src/Load.kt': LOAD_EFFECTS }));
    const findings = loadEffectFindings(facts.files, { finding: findingFactory() });

    expect(findings.map(({ symbol, location }) => `${symbol} ${String(location.line)}`)).toEqual([
      'config 7',
      'counted 8',
      'connect() 13',
      'Store.init 21',
      'Repository.Companion.shared 29',
      'Registry.connection 34',
      'Mode.FAST 42',
    ]);
  });

  it('collects facts of test roots without measuring them, and words a test syntax error for tests', () => {
    const project = writeSources('roots', {
      'src/main/Main.kt': FLAT,
      'src/test/Check.kt': 'package demo.check\n\nclass Check { fun go() { Thread.sleep(5) } }\n',
    });
    const { metrics, facts } = measure(project, ['src/main', 'test:src/test']);
    const broken = measure(writeSources('broken-test', { 'src/test/Broken.kt': BROKEN }), [
      'test:src/test',
    ]);

    expect(metrics.files.map(({ file }) => file)).toEqual(['src/main/Main.kt']);
    expect(facts.files.map(({ file, test, waits }) => [file, test, waits.length])).toEqual([
      ['src/main/Main.kt', false, 0],
      ['src/test/Check.kt', true, 1],
    ]);
    const reported = broken.log.split('\n').find((line) => line.startsWith('src/test/Broken.kt'));
    expect(reported).toMatch(
      /^src\/test\/Broken\.kt:4: .*\. This test source is not compiled by this step: .*$/u,
    );
  });
});

describe.skipIf(!enabled)('kotlin-psi in a Gradle build of several modules', () => {
  let project;
  let shared;

  beforeAll(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-psi-build-'));
    project = twoModuleProject();
    shared = path.join(project, 'build/tmp/nitpickerKotlinPsi');
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('compiles the program once into the root build and every module runs it, in this build and the next', () => {
    const first = runPsiTasks(project);
    expect(first.status, first.stdout + first.stderr).toBe(0);
    const compiled = readdirSync(shared);
    const classFile = path.join(shared, compiled[0], PSI_CLASS);
    const compiledAt = statSync(classFile).mtimeMs;
    const second = runPsiTasks(project);

    expect(second.status, second.stdout + second.stderr).toBe(0);
    expect([compiled.length, readdirSync(shared)]).toEqual([1, compiled]);
    expect(statSync(classFile).mtimeMs).toBe(compiledAt);
    expect([functionsOf(project, 'one'), functionsOf(project, 'two')]).toEqual([['one'], ['two']]);
    expect(existsSync(path.join(project, 'one/build/tmp/nitpickerKotlinPsi'))).toBe(false);
  });

  it('fails with a request for a JDK when Gradle runs on a Java runtime without javac', () => {
    const settings = spawnSync(
      'sh',
      ['-c', 'exec "${JAVA_HOME:+$JAVA_HOME/bin/}java" -XshowSettings:properties -version'],
      { encoding: 'utf8', timeout: 30_000 },
    );
    const jdk = /java\.home = (.+)/u.exec(settings.stderr)[1];
    const runtime = path.join(workspace, 'runtime');
    cpSync(jdk, runtime, { recursive: true });
    rmSync(path.join(runtime, 'bin/javac'));

    const result = runPsiTasks(project, [
      '--no-daemon',
      `-Dorg.gradle.java.home=${runtime}`,
      `-Porg.gradle.java.installations.paths=${jdk}`,
    ]);

    const reasons = (result.stdout + result.stderr)
      .split('\n')
      .filter((line) => line.includes('without javac'))
      .map((line) => line.trim());

    expect(result.status).not.toBe(0);
    expect([...new Set(reasons)]).toEqual([
      `> The kotlin preset compiles its Kotlin parser with javac, and Gradle runs on ${runtime}, ` +
        'a Java runtime without javac. Run the build on a JDK (Java 21): point JAVA_HOME or ' +
        'org.gradle.java.home at one.',
    ]);
  });
});
