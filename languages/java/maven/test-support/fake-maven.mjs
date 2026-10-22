import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  if (existsSync('MAIN_CLASSES')) {
    touch('target/classes/demo/A.class', 'class');
  }
  mkdirSync('target/test-classes', { recursive: true });
  return 0;
}

export function runFakeMaven(argumentsList, io) {
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
