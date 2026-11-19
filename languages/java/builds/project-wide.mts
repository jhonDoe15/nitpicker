import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { JavaFinding } from '../adapters/typed/java-values.mts';
import {
  copiedConstantFindings,
  copyPastedTestFindings,
  couplingFindingsOf,
  featureGraphOf,
  fileLimitFindings,
  inModuleOf,
  jdepsEdges,
  maxValueFindings,
  nullFallThroughFindings,
  kotlinMetricsOf,
  kotlinNodesOf,
  outerClassOf,
  roundTripFindings,
  testOnlyFindings,
  testRuntimeFindings,
  type Cycles,
  type CouplingRun,
  type Declared,
  type ModuleReport,
  type ProjectClasses,
  type WideRun,
  type JdeEdge,
  type KotlinNodes,
  type ReportProject,
} from './typed/project-wide-views.mts';
import { jvmReuseAhead } from './reuse-ahead/reuse-ahead.mts';

const JDEPS_REPORT = 'jdeps.txt';
const JDEPS_CLASSES = 'jdeps-classes.txt';
const PERMITS_REPORT = 'permits.txt';
const ROOT_PACKAGE = '(root)';

function readLines(reportRoot: string, name: string): string[] {
  return readFileSync(path.join(reportRoot, name), 'utf8').split(/\r?\n/u).filter(Boolean);
}

function qualified(qualifier: string, className: string): string {
  if (qualifier === '') {
    return className;
  }
  return `${qualifier}/${className.includes('.') ? className : `${ROOT_PACKAGE}.${className}`}`;
}

function declaringProjects(projects: readonly ProjectClasses[]): Map<string, string[]> {
  const declared = new Map<string, string[]>();
  for (const project of projects) {
    for (const className of new Set(project.classes.map(outerClassOf))) {
      declared.set(className, [...(declared.get(className) ?? []), project.qualifier]);
    }
  }
  return declared;
}

function targetOf(
  target: string,
  { qualifier, declared }: { readonly qualifier: string; readonly declared: Declared },
): string | undefined {
  const owners = declared.get(outerClassOf(target)) ?? [];
  if (owners.includes(qualifier)) {
    return qualified(qualifier, target);
  }
  const [only] = owners;
  return owners.length === 1 && only !== undefined ? qualified(only, target) : undefined;
}

function sourceFile(
  projectRoot: string,
  sourceRoots: readonly string[],
  className: string,
): string | undefined {
  const relative = `${outerClassOf(className).replaceAll('.', '/')}.java`;
  const candidates = sourceRoots.map((root) => `${root}/${relative}`);
  return (
    candidates.find((candidate) => existsSync(path.join(projectRoot, candidate))) ?? candidates[0]
  );
}

function kotlinNodes(projects: readonly ReportProject[]): KotlinNodes {
  const moduleOf = new Map<string, string>();
  const fileOf = new Map<string, string>();
  for (const project of projects) {
    const nodes = kotlinNodesOf(kotlinMetricsOf(project.reportRoot));
    for (const [className, node] of nodes.moduleOf) {
      moduleOf.set(qualified(project.qualifier, className), qualified(project.qualifier, node));
    }
    for (const [node, file] of nodes.fileOf) {
      fileOf.set(qualified(project.qualifier, node), inModuleOf(project.filePrefix, file));
    }
  }
  return { moduleOf, fileOf };
}

function qualifiedEdges(
  project: ReportProject,
  text: string,
  declared: Declared,
): { source: string; target: string }[] {
  return jdepsEdges(text)
    .map((edge: JdeEdge) => ({
      source: qualified(project.qualifier, edge.source),
      target: targetOf(edge.target, { qualifier: project.qualifier, declared }),
    }))
    .flatMap(({ source, target }) => (target === undefined ? [] : [{ source, target }]));
}

function permitsText(reportRoot: string): string {
  const file = path.join(reportRoot, PERMITS_REPORT);
  return existsSync(file)
    ? readLines(reportRoot, PERMITS_REPORT)
        .map((line) => `  ${line}`)
        .join('\n')
    : '';
}

function mergedPermits(projects: readonly ProjectClasses[], declared: Declared): string {
  const lines = projects.flatMap((project) =>
    qualifiedEdges(project, permitsText(project.reportRoot), declared).map(
      ({ source, target }) => `${source} -> ${target}\n`,
    ),
  );
  return [...new Set(lines)].join('');
}

function mergeProjects(
  projectRoot: string,
  projects: readonly ProjectClasses[],
  mergedRoot: string,
): Map<string, string | undefined> {
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
      project.classes.map((name): [string, string | undefined] => [
        qualified(project.qualifier, outerClassOf(name)),
        sourceFile(projectRoot, project.sourceRoots, name),
      ]),
    ),
  );
}

function withClassFiles(cycles: Cycles): Cycles & { readonly classFiles: Map<string, string> } {
  const classes = cycles.classes ?? [];
  return {
    ...cycles,
    classFiles: new Map(
      classes.map(({ qualifier, name, file }): [string, string] => [
        qualified(qualifier, name),
        file,
      ]),
    ),
  };
}

function couplingFindings(
  projectRoot: string,
  { projects, mergedRoot, manifest, kotlin, layout, features }: CouplingRun,
): JavaFinding[] {
  const complete = projects
    .filter(({ reportRoot }) =>
      [JDEPS_REPORT, JDEPS_CLASSES].every((name) => existsSync(path.join(reportRoot, name))),
    )
    .map((project) => ({ ...project, classes: readLines(project.reportRoot, JDEPS_CLASSES) }));
  if (complete.length === 0) {
    return [];
  }
  const [single] = complete;
  if (complete.length === 1 && single?.qualifier === '') {
    return couplingFindingsOf(single.reportRoot, {
      projectRoot,
      sourceRoots: manifest.sourceRoots ?? [],
      kotlin: kotlin ? kotlinNodes([single]) : undefined,
      files: undefined,
      layout,
      features,
    });
  }
  const files = mergeProjects(projectRoot, complete, mergedRoot);
  return couplingFindingsOf(mergedRoot, {
    projectRoot,
    sourceRoots: manifest.sourceRoots ?? [],
    kotlin: kotlin ? kotlinNodes(complete) : undefined,
    files,
    layout,
    features,
  });
}

export function reportModuleProjects(
  modules: readonly ModuleReport[],
  rootKey: string,
): ReportProject[] {
  return modules.map((module) => ({
    reportRoot: module.reportRoot,
    qualifier: module.key === rootKey ? '' : module.dir,
    sourceRoots: module.manifest.sourceRoots ?? [],
    kotlinSourceRoots: module.manifest.kotlinSourceRoots ?? [],
    testSourceRoots: module.manifest.testSourceRoots ?? [],
    kotlinTestSourceRoots: module.manifest.kotlinTestSourceRoots ?? [],
    kotlinExcludedFiles: module.manifest.kotlinExcludedFiles ?? [],
    resourceRoots: module.manifest.resourceRoots ?? [],
  }));
}

export function projectWideReport(
  projectRoot: string,
  { projects, mergedRoot, manifest, kotlin, policy }: WideRun,
): { findings: JavaFinding[]; imports: unknown } {
  const features = featureGraphOf(projectRoot, {
    projects,
    kotlin,
    policy: { layout: policy.layout, exceptions: policy.exceptions },
  });
  const reuse = jvmReuseAhead(projectRoot, {
    projects,
    kotlin,
    policy: { ...policy, layout: features.layout },
  });
  const findings = [
    ...fileLimitFindings(projectRoot, {
      manifest,
      kotlin,
      policy: {
        thresholds: policy.fileLimits,
        conventions: policy.conventions,
        exclude: policy.exclude,
        exceptions: policy.exceptions,
        baselineRoot: policy.baselineRoot,
      },
    }),
    ...couplingFindings(projectRoot, {
      projects,
      mergedRoot,
      manifest,
      kotlin,
      layout: features.layout,
      features: withClassFiles(features.cycles),
    }),
    ...testOnlyFindings(projectRoot, { projects }),
    ...testRuntimeFindings(projectRoot, { projects }),
    ...reuse.findings,
    ...roundTripFindings(projectRoot, { projects, kotlin, policy }),
    ...copiedConstantFindings(projectRoot, { projects, kotlin, policy }),
    ...copyPastedTestFindings(projectRoot, { projects, kotlin, policy }),
    ...maxValueFindings(projectRoot, { projects, kotlin, policy }),
    ...nullFallThroughFindings(projectRoot, { projects, kotlin, policy }),
    ...features.findings,
  ];
  return { findings, imports: reuse.imports };
}
