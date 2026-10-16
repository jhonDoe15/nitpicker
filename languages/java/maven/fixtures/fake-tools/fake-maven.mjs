#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argumentsList = process.argv.slice(2);
const valueOf = (prefix) =>
  argumentsList.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
const mentions = (goal) => argumentsList.some((argument) => argument.includes(goal));
const touch = (file, text = '') => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};

function effectivePom() {
  touch(valueOf('-Doutput='), readFileSync('pom.xml', 'utf8'));
}

function toolClasspaths() {
  const directory = path.dirname(argumentsList[argumentsList.indexOf('--file') + 1]);
  const jar = path.join(directory, 'fake-tool.jar');
  touch(jar);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      touch(path.join(directory, entry.name, 'classpath.txt'), jar);
    }
  }
}

function build() {
  if (existsSync('MAVEN_FAIL')) {
    process.stdout.write(`[ERROR] ${readFileSync('MAVEN_FAIL', 'utf8')}`);
    process.exit(1);
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
}

if (mentions(':effective-pom')) {
  effectivePom();
} else if (mentions(':build-classpath')) {
  toolClasspaths();
} else {
  build();
}
