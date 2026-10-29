import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';

const GRADLE_TIMEOUT = 180_000;
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

export function pinnedKotlinCompiler() {
  return /kotlinCompiler\s*:\s*'([^']+)'/u.exec(readFileSync(INIT_SCRIPT, 'utf8'))[1];
}

function printedValue(lines, key) {
  return lines.find((line) => line.startsWith(`${key}=`)).slice(key.length + 1);
}

function gradleClasspath(workspace, project, gradle) {
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
    { cwd: project, encoding: 'utf8', timeout: GRADLE_TIMEOUT },
  );
  if (result.status !== 0) {
    throw new Error(`printKotlinCompiler failed: ${result.stderr}`);
  }
  const lines = result.stdout.split('\n');
  return {
    javaHome: printedValue(lines, 'JAVA_HOME'),
    classpath: printedValue(lines, 'CLASSPATH'),
  };
}

function compilePsiProgram(workspace, { javaHome, classpath }) {
  const sources = path.resolve(import.meta.dirname, '../../gradle/kotlin-psi');
  const output = path.join(workspace, 'psi-classes');
  const files = readdirSync(sources, { recursive: true })
    .filter((entry) => entry.endsWith('.java'))
    .map((entry) => path.join(sources, entry));
  const result = spawnSync(
    path.join(javaHome, 'bin/javac'),
    ['-proc:none', '-d', output, '-cp', classpath, ...files],
    { encoding: 'utf8', timeout: GRADLE_TIMEOUT },
  );
  if (result.status !== 0) {
    throw new Error(`javac failed: ${result.stderr}`);
  }
  return output;
}

export function prepareKotlinPsi(workspace, project, gradle) {
  const toolchain = gradleClasspath(workspace, project, gradle);
  return { ...toolchain, classes: compilePsiProgram(workspace, toolchain) };
}

export function runKotlinPsi(psi, project, roots = ['src']) {
  const metricsOutput = path.join(project, 'metrics.json');
  const factsOutput = path.join(project, 'facts.json');
  const result = spawnSync(
    path.join(psi.javaHome, 'bin/java'),
    [
      `-Dnitpicker.kotlinCompiler=${pinnedKotlinCompiler()}`,
      '-cp',
      `${psi.classpath}${path.delimiter}${psi.classes}`,
      'nitpicker.kotlinpsi.KotlinPsi',
      metricsOutput,
      factsOutput,
      project,
      ...roots,
    ],
    { cwd: project, encoding: 'utf8', timeout: GRADLE_TIMEOUT },
  );
  return {
    status: result.status,
    log: result.stdout + result.stderr,
    metrics: result.status === 0 ? JSON.parse(readFileSync(metricsOutput, 'utf8')) : undefined,
    facts: result.status === 0 ? JSON.parse(readFileSync(factsOutput, 'utf8')) : undefined,
  };
}
