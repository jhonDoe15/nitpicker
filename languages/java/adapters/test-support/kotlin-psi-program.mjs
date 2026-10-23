import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';

const PSI_SOURCES = path.resolve(import.meta.dirname, '../../gradle/kotlin-psi');
const CLASSPATH_VARIABLE = 'NITPICKER_KOTLIN_COMPILER_CLASSPATH';
const PINNED = /kotlinCompiler\s*:\s*'([^']+)'/u;

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

function javaTool(javaHome, name) {
  return javaHome === undefined ? name : path.join(javaHome, 'bin', name);
}

function printedValue(lines, key) {
  return lines.find((line) => line.startsWith(`${key}=`)).slice(key.length + 1);
}

function gradleCompiler({ workspace, project, gradle }) {
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
  return {
    javaHome: printedValue(lines, 'JAVA_HOME'),
    classpath: printedValue(lines, 'CLASSPATH'),
  };
}

function compilePsiProgram({ workspace, javaHome, classpath }) {
  const output = path.join(workspace, 'psi-classes');
  const sources = readdirSync(PSI_SOURCES, { recursive: true })
    .filter((entry) => entry.endsWith('.java'))
    .map((entry) => path.join(PSI_SOURCES, entry));
  const result = spawnSync(
    javaTool(javaHome, 'javac'),
    ['-proc:none', '-d', output, '-cp', classpath, ...sources],
    { encoding: 'utf8', timeout: 180_000 },
  );
  expect(result.status, result.stderr).toBe(0);
  return output;
}

/**
 * Compiles the PSI program and returns what `runPsiProgram` needs. The compiler jars come from
 * `environment.NITPICKER_KOTLIN_COMPILER_CLASSPATH` (run on the `java` and `javac` of the path, or
 * of `environment.JAVA_HOME`) or, when it is not set, from Gradle for `project`.
 */
export function prepareCompiler({ workspace, project, gradle, environment }) {
  const named = environment[CLASSPATH_VARIABLE];
  const { javaHome, classpath } = named
    ? { javaHome: environment.JAVA_HOME || undefined, classpath: named }
    : gradleCompiler({ workspace, project, gradle });
  return {
    javaHome,
    classpath,
    classes: compilePsiProgram({ workspace, javaHome, classpath }),
    pinned: PINNED.exec(readFileSync(INIT_SCRIPT, 'utf8'))[1],
  };
}

/** Runs the program on `project`; `{ ...compiler, published: true }` runs it as a published library. */
export function runPsiProgram(compiler, project, roots = ['src']) {
  const metricsOutput = path.join(project, 'metrics.json');
  const factsOutput = path.join(project, 'facts.json');
  const result = spawnSync(
    javaTool(compiler.javaHome, 'java'),
    [
      `-Dnitpicker.kotlinCompiler=${compiler.pinned}`,
      ...(compiler.published === true ? ['-Dnitpicker.published=true'] : []),
      '-cp',
      `${compiler.classpath}${path.delimiter}${compiler.classes}`,
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
