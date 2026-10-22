import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function write(root, files) {
  for (const [name, text] of Object.entries(files)) {
    const target = path.resolve(root, name);
    if (!target.startsWith(root + path.sep)) {
      throw new Error(`${name} is outside the test project`);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}

function javaClass(qualifiedName) {
  const index = qualifiedName.lastIndexOf('.');
  const name = qualifiedName.slice(index + 1);
  return `package ${qualifiedName.slice(0, index)};\n\npublic class ${name} {}\n`;
}

export function javaSources(names, root = 'src/main/java') {
  return Object.fromEntries(
    names.map((name) => [`${root}/${name.replaceAll('.', '/')}.java`, javaClass(name)]),
  );
}

function edgeLine([source, target]) {
  return `   ${source} -> ${target} classes\n`;
}

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

export function featureProjects() {
  const temporaryRoots = [];

  function remove() {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  function project({ files = {}, modules }) {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-feature-graph-')));
    temporaryRoots.push(root);
    write(root, files);
    return { root, projects: modules.map((module) => projectOf(root, module)) };
  }

  return { project, remove };
}

export function rows(findings) {
  return findings.map(({ rule, path: file, identity }) => [rule, file, identity]);
}
