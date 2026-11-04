import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathInside } from '../../review-rules/java-sources.mjs';

export const JUNIT_TEST = 'org.junit.jupiter.api.Test';

function write(root, files) {
  for (const [name, text] of Object.entries(files)) {
    const file = pathInside(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

function edgeLine([source, target]) {
  return `   ${source} -> ${target} not found\n`;
}

export function createFakeProjects() {
  const roots = [];
  function project(files) {
    const root = mkdtempSync(path.join(tmpdir(), 'test-runtime-'));
    roots.push(root);
    write(root, files);
    return root;
  }
  function remove() {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }
  return { project, remove };
}

export function fakeModule(root, qualifier, { classes = [], tests = [] }) {
  const reportRoot = path.join(root, '.reports', qualifier || 'root');
  write(reportRoot, {
    'jdeps-classes.txt': classes.map((name) => `${name}\n`).join(''),
    'jdeps.txt': '',
    'jdeps-test.txt': tests.map(edgeLine).join(''),
    'manifest.json': '{}',
  });
  const prefix = qualifier === '' ? '' : `${qualifier}/`;
  return {
    reportRoot,
    qualifier,
    sourceRoots: [`${prefix}src/main/java`],
    kotlinSourceRoots: [`${prefix}src/main/kotlin`],
    testSourceRoots: [`${prefix}src/test/java`],
    kotlinTestSourceRoots: [`${prefix}src/test/kotlin`],
  };
}

export function javaSource(name, body = '') {
  return `package shop;\n\nclass ${name} {${body}}\n`;
}

export function kotlinSource(name, body = '') {
  return `package shop\n\nclass ${name} {${body}}\n`;
}
