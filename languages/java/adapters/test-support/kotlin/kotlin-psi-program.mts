import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { parseJson, textOf } from '../../../../../shared/values/readers.mts';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';

export function pinnedKotlinCompiler(): string {
  return /kotlinCompiler\s*:\s*'([^']+)'/.exec(readFileSync(INIT_SCRIPT, 'utf8'))?.[1] ?? '';
}

function insideOf(base: string, name: string): string {
  const relative = path.relative(base, path.resolve(base, name));
  if (relative === '' || relative.split(path.sep)[0] === '..' || path.isAbsolute(relative)) {
    throw new Error(`${name} is outside ${base}`);
  }
  return path.join(base, relative);
}

export type PsiCompiler = {
  readonly javaHome: string | undefined;
  readonly classpath: string;
  readonly classes: string;
  readonly pinned: string | undefined;
  readonly published?: true;
};
type PsiRun = {
  readonly status: SpawnSyncReturns<string>['status'];
  readonly log: string;
  readonly metrics: unknown;
  readonly facts: unknown;
};

const PSI_SOURCES = path.resolve(import.meta.dirname, '../../../gradle/kotlin-psi');
const CLASSPATH_VARIABLE = 'NITPICKER_KOTLIN_COMPILER_CLASSPATH';

function javaTool(javaHome: string | undefined, name: string): string {
  return javaHome === undefined ? name : path.join(javaHome, 'bin', name);
}

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

export function gradleClasspath({
  gradle,
  project,
  workspace,
}: {
  gradle: string;
  project: string;
  workspace: string;
}): { javaHome: string; classpath: string } {
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
  function valueOf(key: string): string {
    return (lines.find((line) => line.startsWith(`${key}=`)) ?? '').slice(key.length + 1);
  }
  return { javaHome: valueOf('JAVA_HOME'), classpath: valueOf('CLASSPATH') };
}

export function writeSources(
  workspace: string,
  name: string,
  files: Readonly<Record<string, string>>,
): string {
  const dir = insideOf(workspace, name);
  for (const [relative, content] of Object.entries(files)) {
    const file = insideOf(dir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}

export function compilePsiProgram({
  java,
  classpath,
  workspace,
}: {
  java: string | undefined;
  classpath: string;
  workspace: string;
}): string {
  const output = path.join(workspace, 'psi-classes');
  const sources = readdirSync(PSI_SOURCES, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.java'))
    .map((entry) => path.join(PSI_SOURCES, entry));
  const result = spawnSync(
    javaTool(java, 'javac'),
    ['-proc:none', '-d', output, '-cp', classpath, ...sources],
    { encoding: 'utf8', timeout: 180_000 },
  );
  expect(result.status, result.stderr).toBe(0);
  return output;
}

export function prepareCompiler({
  workspace,
  project,
  gradle,
  environment,
}: {
  workspace: string;
  project: string;
  gradle: string;
  environment: Readonly<Record<string, string | undefined>>;
}): PsiCompiler {
  const named = environment[CLASSPATH_VARIABLE];
  const javaHomeValue = environment['JAVA_HOME'];
  const { javaHome, classpath } =
    named !== undefined && named !== ''
      ? { javaHome: javaHomeValue === '' ? undefined : javaHomeValue, classpath: named }
      : gradleClasspath({ gradle, project, workspace });
  return {
    javaHome,
    classpath,
    classes: compilePsiProgram({ java: javaHome, classpath, workspace }),
    pinned: pinnedKotlinCompiler(),
  };
}

export function runPsiProgram(
  compiler: PsiCompiler,
  project: string,
  roots: readonly string[] = ['src'],
  properties: readonly string[] = [],
): PsiRun {
  const metricsOutput = path.join(project, 'metrics.json');
  const factsOutput = path.join(project, 'facts.json');
  const result = spawnSync(
    javaTool(compiler.javaHome, 'java'),
    [
      `-Dnitpicker.kotlinCompiler=${textOf(compiler.pinned)}`,
      ...properties.map((property) => `-D${property}`),
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
    metrics: result.status === 0 ? parseJson(readFileSync(metricsOutput, 'utf8')) : undefined,
    facts: result.status === 0 ? parseJson(readFileSync(factsOutput, 'utf8')) : undefined,
  };
}

export function prepareKotlinPsi(workspace: string, project: string, gradle: string): PsiCompiler {
  return prepareCompiler({ workspace, project, gradle, environment: {} });
}

export function runKotlinPsi(
  psi: PsiCompiler,
  project: string,
  roots: readonly string[] = ['src'],
): PsiRun {
  return runPsiProgram(psi, project, roots);
}
