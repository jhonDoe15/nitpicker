import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  outerClass,
  parseJdeps,
  readCouplingFindings,
} from '../adapters/metrics/java-coupling.mjs';
import { readJavaFileLimitFindings } from '../adapters/metrics/java-structure.mjs';
import { kotlinModules, readKotlinMetrics } from '../adapters/kotlin/kotlin-metrics.mjs';

const JDEPS_REPORT = 'jdeps.txt';
const JDEPS_CLASSES = 'jdeps-classes.txt';
const PERMITS_REPORT = 'permits.txt';
const ROOT_PACKAGE = '(root)';

function readLines(reportRoot, name) {
  return readFileSync(path.join(reportRoot, name), 'utf8').split(/\r?\n/u).filter(Boolean);
}

function qualified(qualifier, className) {
  if (qualifier === '') {
    return className;
  }
  return `${qualifier}/${className.includes('.') ? className : `${ROOT_PACKAGE}.${className}`}`;
}

function declaringProjects(projects) {
  const declared = new Map();
  for (const project of projects) {
    for (const className of new Set(project.classes.map(outerClass))) {
      declared.set(className, [...(declared.get(className) ?? []), project.qualifier]);
    }
  }
  return declared;
}

function targetOf(target, { qualifier, declared }) {
  const owners = declared.get(outerClass(target)) ?? [];
  if (owners.includes(qualifier)) {
    return qualified(qualifier, target);
  }
  return owners.length === 1 ? qualified(owners[0], target) : undefined;
}

function sourceFile(projectRoot, sourceRoots, className) {
  const relative = `${outerClass(className).replaceAll('.', '/')}.java`;
  const candidates = sourceRoots.map((root) => `${root}/${relative}`);
  return (
    candidates.find((candidate) => existsSync(path.join(projectRoot, candidate))) ?? candidates[0]
  );
}

function kotlinNodes(projects) {
  const moduleOf = new Map();
  const fileOf = new Map();
  for (const project of projects) {
    const nodes = kotlinModules(readKotlinMetrics(project.reportRoot));
    for (const [className, node] of nodes.moduleOf) {
      moduleOf.set(qualified(project.qualifier, className), qualified(project.qualifier, node));
    }
    for (const [node, file] of nodes.fileOf) {
      fileOf.set(qualified(project.qualifier, node), file);
    }
  }
  return { moduleOf, fileOf };
}

function qualifiedEdges(project, text, declared) {
  return parseJdeps(text)
    .map((edge) => ({
      source: qualified(project.qualifier, edge.source),
      target: targetOf(edge.target, { qualifier: project.qualifier, declared }),
    }))
    .filter((edge) => edge.target !== undefined);
}

function permitsText(reportRoot) {
  const file = path.join(reportRoot, PERMITS_REPORT);
  return existsSync(file)
    ? readLines(reportRoot, PERMITS_REPORT)
        .map((line) => `  ${line}`)
        .join('\n')
    : '';
}

function mergedPermits(projects, declared) {
  const lines = projects.flatMap((project) =>
    qualifiedEdges(project, permitsText(project.reportRoot), declared).map(
      ({ source, target }) => `${source} -> ${target}\n`,
    ),
  );
  return [...new Set(lines)].join('');
}

function mergeProjects(projectRoot, projects, mergedRoot) {
  const declared = declaringProjects(projects);
  const edges = projects.flatMap((project) =>
    qualifiedEdges(
      project,
      readFileSync(path.join(project.reportRoot, JDEPS_REPORT), 'utf8'),
      declared,
    ),
  );
  mkdirSync(mergedRoot, { recursive: true });
  writeFileSync(
    path.join(mergedRoot, JDEPS_CLASSES),
    projects
      .flatMap((project) =>
        project.classes.map((name) => `${qualified(project.qualifier, name)}\n`),
      )
      .join(''),
  );
  writeFileSync(
    path.join(mergedRoot, JDEPS_REPORT),
    edges.map(({ source, target }) => `   ${source} -> ${target}\n`).join(''),
  );
  writeFileSync(path.join(mergedRoot, PERMITS_REPORT), mergedPermits(projects, declared));
  return new Map(
    projects.flatMap((project) =>
      [...new Set(project.classes.map(outerClass))].map((name) => [
        qualified(project.qualifier, name),
        sourceFile(projectRoot, project.sourceRoots, name),
      ]),
    ),
  );
}

function couplingFindings(projectRoot, { projects, mergedRoot, manifest, kotlin }) {
  const complete = projects
    .filter(({ reportRoot }) =>
      [JDEPS_REPORT, JDEPS_CLASSES].every((name) => existsSync(path.join(reportRoot, name))),
    )
    .map((project) => ({ ...project, classes: readLines(project.reportRoot, JDEPS_CLASSES) }));
  if (complete.length === 0) {
    return [];
  }
  const [single] = complete;
  if (complete.length === 1 && single.qualifier === '') {
    return readCouplingFindings(single.reportRoot, {
      projectRoot,
      sourceRoots: manifest.sourceRoots ?? [],
      kotlin: kotlin ? kotlinNodes([single]) : undefined,
    });
  }
  const files = mergeProjects(projectRoot, complete, mergedRoot);
  return readCouplingFindings(mergedRoot, {
    projectRoot,
    sourceRoots: manifest.sourceRoots ?? [],
    kotlin: kotlin ? kotlinNodes(complete) : undefined,
    files,
  });
}

export function projectWideFindings(
  projectRoot,
  { projects, mergedRoot, manifest, kotlin, policy },
) {
  return [
    ...readJavaFileLimitFindings(projectRoot, {
      manifest,
      kotlin,
      policy: {
        thresholds: policy.fileLimits,
        exclude: policy.exclude,
        exceptions: policy.exceptions,
      },
    }),
    ...couplingFindings(projectRoot, { projects, mergedRoot, manifest, kotlin }),
  ];
}
