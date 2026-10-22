import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

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

function surefireReports() {
  const results = 'test-results/test';
  if (existsSync(results)) {
    mkdirSync('target/surefire-reports', { recursive: true });
    touch('target/nitpicker-jacoco.exec', 'recorded');
    for (const report of readdirSync(results)) {
      copyFileSync(path.join(results, report), path.join('target/surefire-reports', report));
    }
  }
}

function build(valueOf, io) {
  if (existsSync('MAVEN_FAIL')) {
    io.stdout.write(`[ERROR] ${readFileSync('MAVEN_FAIL', 'utf8')}`);
    return 1;
  }
  const output = valueOf('-DoutputFile=')
    .replace('${project.groupId}', 'demo')
    .replace('${project.artifactId}', 'demo');
  touch(output);
  mkdirSync('target/classes', { recursive: true });
  mkdirSync('target/test-classes', { recursive: true });
  if (existsSync('MAIN_CLASSES')) {
    classesOf('src/main/java', 'target/classes');
    classesOf('src/test/java', 'target/test-classes');
  }
  surefireReports();
  return 0;
}

function runFakeMaven(argumentsList, io) {
  function valueOf(prefix) {
    return argumentsList.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  }
  function mentions(goal) {
    return argumentsList.some((argument) => argument.includes(goal));
  }
  if (mentions(':effective-pom')) {
    touch(valueOf('-Doutput='), readFileSync('pom.xml', 'utf8'));
  } else if (mentions(':build-classpath')) {
    toolClasspaths(argumentsList);
  } else {
    return build(valueOf, io);
  }
  return 0;
}

export const fakeMaven = { url: import.meta.url, run: runFakeMaven };
