import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function touch(file, text = '') {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function toolClasspaths(argumentsList) {
  const directory = path.dirname(argumentsList[argumentsList.indexOf('--file') + 1]);
  const jar = path.join(directory, 'fake-tool.jar');
  touch(jar);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      touch(path.join(directory, entry.name, 'classpath.txt'), jar);
    }
  }
}

function classesOf(sourceRoot, classesRoot) {
  if (existsSync(sourceRoot)) {
    for (const file of readdirSync(sourceRoot, { recursive: true })) {
      if (file.endsWith('.java')) {
        touch(path.join(classesRoot, file.replace(/\.java$/u, '.class')), 'class');
      }
    }
  }
}

function surefireReports(cwd) {
  const results = path.join(cwd, 'test-results/test');
  if (existsSync(results)) {
    const reports = path.join(cwd, 'target/surefire-reports');
    mkdirSync(reports, { recursive: true });
    touch(path.join(cwd, 'target/nitpicker-jacoco.exec'), 'recorded');
    cpSync(results, reports, { recursive: true });
  }
}

function build(valueOf, cwd) {
  if (existsSync(path.join(cwd, 'MAVEN_FAIL'))) {
    return {
      status: 1,
      stdout: `[ERROR] ${readFileSync(path.join(cwd, 'MAVEN_FAIL'), 'utf8')}`,
      stderr: '',
    };
  }
  const output = valueOf('-DoutputFile=')
    .replace('${project.groupId}', 'demo')
    .replace('${project.artifactId}', 'demo');
  touch(output);
  mkdirSync(path.join(cwd, 'target/classes'), { recursive: true });
  mkdirSync(path.join(cwd, 'target/test-classes'), { recursive: true });
  if (existsSync(path.join(cwd, 'MAIN_CLASSES'))) {
    classesOf(path.join(cwd, 'src/main/java'), path.join(cwd, 'target/classes'));
    classesOf(path.join(cwd, 'src/test/java'), path.join(cwd, 'target/test-classes'));
  }
  surefireReports(cwd);
  return { status: 0, stdout: '', stderr: '' };
}

export function runFakeMaven({ args: argumentsList, cwd }) {
  function valueOf(prefix) {
    return argumentsList.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  }
  function mentions(goal) {
    return argumentsList.some((argument) => argument.includes(goal));
  }
  if (mentions(':effective-pom')) {
    touch(valueOf('-Doutput='), readFileSync(path.join(cwd, 'pom.xml'), 'utf8'));
  } else if (mentions(':build-classpath')) {
    toolClasspaths(argumentsList);
  } else {
    return build(valueOf, cwd);
  }
  return { status: 0, stdout: '', stderr: '' };
}

export const fakeMavenCommand = fileURLToPath(import.meta.url);
