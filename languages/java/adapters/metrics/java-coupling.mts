import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { outerClass as untypedOuterClass } from '../../ingest/class-names.mts';
import {
  buildCouplingReport as untypedBuildCouplingReport,
  evaluateCoupling as untypedEvaluateCoupling,
} from '../../../../shared/rules/coupling.mjs';
import {
  featureRoleContract as untypedFeatureRoleContract,
  PUBLIC_FACES,
} from '../../../../shared/rules/features/feature-roles.mjs';
import { cycleFindings as untypedCycleFindings } from '../../guards/cycles.mts';
import { callUntyped, findingsOf, type JavaFinding } from '../typed/java-values.mts';
import type {
  CouplingEdge,
  CouplingFeatures,
  CouplingOptions,
  CouplingProject,
  CouplingReport,
  FeatureRole,
} from './java-coupling-types.mts';

function cycleFindings(untyped: unknown, ...args: readonly unknown[]): JavaFinding[] {
  return findingsOf(callUntyped(untyped, ...args));
}

const outerClass: (className: string) => string = untypedOuterClass;
const buildCouplingReport: (input: {
  readonly modules: readonly string[];
  readonly edges: readonly CouplingEdge[];
  readonly packageOf: (className: string) => string;
  readonly fileOf: (className: string) => string;
  readonly roleOf: (module: string) => FeatureRole;
}) => CouplingReport = untypedBuildCouplingReport;
const evaluateCoupling: (report: unknown, tool: string) => JavaFinding[] = untypedEvaluateCoupling;
const featureRoleContract: (layout: unknown, face: unknown) => (file: string) => FeatureRole =
  untypedFeatureRoleContract;

const COUPLING_TOOL = 'coupling';
const JDEPS_REPORT = 'jdeps.txt';
const JDEPS_CLASSES = 'jdeps-classes.txt';
const PERMITS_REPORT = 'permits.txt';
const ROOT_PACKAGE = '(root)';

export function parseJdeps(text: string): CouplingEdge[] {
  const edges: CouplingEdge[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s+(\S+)\s+->\s+(\S+)(?:\s|$)/.exec(line);
    if (match !== null) {
      edges.push({ source: match[1] ?? '', target: match[2] ?? '' });
    }
  }
  return edges;
}

function packageOf(className: string): string {
  const index = className.lastIndexOf('.');
  return index < 0 ? ROOT_PACKAGE : className.slice(0, index);
}

function featurePackage(module: string, directory: string): string {
  const name = packageOf(module);
  const qualifier = name.slice(0, name.lastIndexOf('/') + 1);
  const parts = name.slice(qualifier.length).split('.');
  const length = parts
    .map((_, index) => parts.length - index)
    .find((count) => {
      const folder = parts.slice(0, count).join('/');
      return directory === folder || directory.endsWith(`/${folder}`);
    });
  return length === undefined ? directory : `${qualifier}${parts.slice(0, length).join('.')}`;
}

function packageRoles(
  layout: unknown,
  fileOf: (className: string) => string,
): (module: string) => FeatureRole {
  const roleOfFile = featureRoleContract(layout ?? {}, PUBLIC_FACES.jvm);
  return (module) => {
    const role = roleOfFile(fileOf(module));
    return role.kind === 'feature'
      ? { ...role, directory: featurePackage(module, role.directory) }
      : role;
  };
}

export function analyzeJavaCoupling({
  classes,
  edges,
  fileOf,
  moduleOf = outerClass,
  layout,
}: CouplingOptions): CouplingReport {
  return buildCouplingReport({
    modules: [...new Set(classes.map(moduleOf))].sort(),
    edges: edges.map((edge) => ({
      source: moduleOf(edge.source),
      target: moduleOf(edge.target),
    })),
    packageOf,
    fileOf,
    roleOf: packageRoles(layout, fileOf),
  });
}

export function readCouplingFindings(
  reportRoot: string,
  { projectRoot, sourceRoots, kotlin, files, layout, features }: CouplingProject,
): JavaFinding[] {
  const jdeps = path.join(reportRoot, JDEPS_REPORT);
  const classList = path.join(reportRoot, JDEPS_CLASSES);
  if (!(existsSync(jdeps) && existsSync(classList))) {
    return [];
  }
  const classes = readFileSync(classList, 'utf8').split(/\r?\n/).filter(Boolean);
  function fileOf(className: string): string {
    const known =
      kotlin?.fileOf.get(className) ??
      features?.classFiles?.get(className) ??
      files?.get(className);
    if (known !== undefined) {
      return known;
    }
    const relative = `${className.replaceAll('.', '/')}.java`;
    const candidates = sourceRoots.map((root) => `${root}/${relative}`);
    return (
      candidates.find((candidate) => existsSync(path.join(projectRoot, candidate))) ??
      candidates[0] ??
      relative
    );
  }
  const fileModules = fileRepresentatives(
    classes.map(outerClass).filter((outer) => kotlin?.moduleOf.get(outer) === undefined),
    fileOf,
  );
  function moduleOf(className: string): string {
    const outer = outerClass(className);
    return kotlin?.moduleOf.get(outer) ?? fileModules.get(outer) ?? outer;
  }
  const edges = parseJdeps(readFileSync(jdeps, 'utf8'));
  const report = analyzeJavaCoupling({ classes, edges, fileOf, moduleOf, layout });
  return [
    ...evaluateCoupling(report, COUPLING_TOOL),
    ...packageCycles({ reportRoot, classes, edges, moduleOf, fileOf }, features),
  ];
}

function fileRepresentatives(
  outers: readonly string[],
  fileOf: (className: string) => string,
): Map<string, string> {
  const byFile = new Map<string, string[]>();
  for (const outer of new Set(outers)) {
    const file = fileOf(outer);
    const names = byFile.get(file);
    if (names === undefined) {
      byFile.set(file, [outer]);
    } else {
      names.push(outer);
    }
  }
  const representatives = new Map<string, string>();
  for (const [file, names] of byFile) {
    const stem = path.basename(file, path.extname(file));
    const sorted = names.toSorted();
    const representative =
      sorted.find((name) => name.slice(name.lastIndexOf('.') + 1) === stem) ?? sorted[0] ?? '';
    for (const name of names) {
      representatives.set(name, representative);
    }
  }
  return representatives;
}

function permittedEdges(reportRoot: string): Set<string> {
  const permits = path.join(reportRoot, PERMITS_REPORT);
  return new Set(
    existsSync(permits)
      ? parseJdeps(
          readFileSync(permits, 'utf8')
            .split(/\r?\n/)
            .map((line) => `  ${line}`)
            .join('\n'),
        ).map((edge) => `${edge.source}\0${edge.target}`)
      : [],
  );
}

function packageCycles(
  {
    reportRoot,
    classes,
    edges,
    moduleOf,
    fileOf,
  }: {
    readonly reportRoot: string;
    readonly classes: readonly string[];
    readonly edges: readonly CouplingEdge[];
    readonly moduleOf: (className: string) => string;
    readonly fileOf: (className: string) => string;
  },
  features: CouplingFeatures | undefined,
): JavaFinding[] {
  const permitted = permittedEdges(reportRoot);
  return cycleFindings(
    untypedCycleFindings,
    {
      modules: [...new Set(classes.map(moduleOf))],
      edges: edges
        .filter((edge) => !permitted.has(`${edge.source}\0${edge.target}`))
        .map((edge) => ({ source: moduleOf(edge.source), target: moduleOf(edge.target) })),
      packageOf,
      fileOf,
    },
    COUPLING_TOOL,
    features,
  );
}
