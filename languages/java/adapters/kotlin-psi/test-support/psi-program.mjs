import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';

export const pinnedKotlinCompiler = /kotlinCompiler\s*:\s*'([^']+)'/.exec(
  readFileSync(INIT_SCRIPT, 'utf8'),
)[1];

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
    { cwd: project, encoding: 'utf8', timeout: 15 * 60 * 1000 },
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

export function runPsiProgram({ java, classpath, source, project }) {
  const output = path.join(project, 'program.json');
  const result = spawnSync(
    path.join(java, 'bin/java'),
    [
      `-Dnitpicker.kotlinCompiler=${pinnedKotlinCompiler}`,
      '-cp',
      classpath,
      source,
      output,
      project,
      'src',
    ],
    { cwd: project, encoding: 'utf8', timeout: 5 * 60 * 1000 },
  );
  return {
    status: result.status,
    log: result.stdout + result.stderr,
    result: result.status === 0 ? JSON.parse(readFileSync(output, 'utf8')) : undefined,
  };
}
