import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const roots = [];

export function removeFeatureProjects() {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

function write(root, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
}

export function javaClass(qualifiedName) {
  const index = qualifiedName.lastIndexOf('.');
  const name = qualifiedName.slice(index + 1);
  return `package ${qualifiedName.slice(0, index)};\n\npublic class ${name} {}\n`;
}

export function javaSources(names, root = 'src/main/java') {
  return Object.fromEntries(
    names.map((name) => [`${root}/${name.replaceAll('.', '/')}.java`, javaClass(name)]),
  );
}

const edgeLine = ([source, target]) => `   ${source} -> ${target} classes\n`;

function reportFiles(module) {
  return {
    'jdeps-classes.txt': module.classes.map((name) => `${name}\n`).join(''),
    'jdeps.txt': (module.edges ?? []).map(edgeLine).join(''),
    'jdeps-test.txt': '',
    ...(module.kotlinMetrics === undefined
      ? {}
      : { 'kotlin-metrics.json': JSON.stringify(module.kotlinMetrics) }),
    ...(module.springArch === undefined
      ? {}
      : { 'spring-arch.json': JSON.stringify(module.springArch) }),
  };
}

function projectOf(root, module) {
  const qualifier = module.qualifier ?? '';
  const prefix = qualifier === '' ? '' : `${qualifier}/`;
  const reportRoot = path.join(root, '.reports', qualifier || 'root');
  write(reportRoot, reportFiles(module));
  return {
    reportRoot,
    qualifier,
    sourceRoots: [`${prefix}src/main/java`],
    kotlinSourceRoots: [`${prefix}src/main/kotlin`],
    resourceRoots: [],
  };
}

export function featureProject({ files = {}, modules }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-feature-graph-'));
  roots.push(root);
  write(root, files);
  return { root, projects: modules.map((module) => projectOf(root, module)) };
}

export function rows(findings) {
  return findings.map(({ rule, path: file, identity }) => [rule, file, identity]);
}
