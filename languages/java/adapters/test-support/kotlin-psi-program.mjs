import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';

export const pinnedKotlinCompiler = /kotlinCompiler\s*:\s*'([^']+)'/.exec(
  readFileSync(INIT_SCRIPT, 'utf8'),
)[1];

const PSI_SOURCES = path.resolve(import.meta.dirname, '../../gradle/kotlin-psi');

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

export function gradleClasspath({ gradle, project, workspace }) {
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

export function writeSources(workspace, name, files) {
  const dir = path.join(workspace, name);
  for (const [relative, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
    writeFileSync(path.join(dir, relative), content);
  }
  return dir;
}

export function compilePsiProgram({ java, classpath, workspace }) {
  const output = path.join(workspace, 'psi-classes');
  const sources = readdirSync(PSI_SOURCES, { recursive: true })
    .filter((entry) => entry.endsWith('.java'))
    .map((entry) => path.join(PSI_SOURCES, entry));
  const result = spawnSync(
    path.join(java, 'bin/javac'),
    ['-proc:none', '-d', output, '-cp', classpath, ...sources],
    { encoding: 'utf8', timeout: 180_000 },
  );
  expect(result.status, result.stderr).toBe(0);
  return output;
}
