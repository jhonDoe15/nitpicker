import { isExplainedCycle } from '../../../../shared/graph/explained-cycles.mjs';
import { stronglyConnected as untypedStronglyConnected } from '../../../../shared/graph/strongly-connected.mjs';
import { listed as untypedListed } from '../../../../shared/rules/features/feature-boundaries.mjs';
import { importEdges as untypedImportEdges } from '../analysis/python-coupling.mts';
import type {
  Finding,
  ImportEdge,
  ImportStatement,
  ImportsReport,
  OtherModule,
  PythonModule,
} from '../analysis/typed/python-graph-types.mts';
import {
  entryOf,
  type FeatureView,
  type ImportEdges,
  type ModuleIndex,
  type PackageEdge,
  type StronglyConnected,
} from './typed/import-rule-types.mts';

const importEdges: ImportEdges = untypedImportEdges;
const listed: (names: readonly string[]) => string = untypedListed;
const stronglyConnected: StronglyConnected = untypedStronglyConnected;
const ENFORCEABLE = 'enforceable';
const COUPLING_TOOL = 'coupling';
const PACKAGE_CYCLE_RULE = 'package-cycle';
const MODULE_CYCLE_RULE = 'no-production-cycles';
const OUTSIDE_ROOTS_RULE = 'no-import-outside-roots';
const NO_FEATURES: FeatureView = { explainedCycles: [], featureOf: () => undefined };

function packageOf(entry: PythonModule): string {
  if (entry.isPackage) {
    return entry.module;
  }
  return entry.module.includes('.')
    ? entry.module.slice(0, entry.module.lastIndexOf('.'))
    : '(root)';
}

function isInside(name: string, owner: string): boolean {
  return name === owner || name.startsWith(`${owner}.`);
}

function runtimeEdges({ modules, imports }: ImportsReport): ImportEdge[] {
  return importEdges(modules, imports).filter(
    ({ source, target, kind }) => kind === 'runtime' && source !== target,
  );
}

function reExports(byName: ModuleIndex, source: string, target: string): boolean {
  return entryOf(byName, source).isPackage && isInside(target, source);
}

function packageEdges(byName: ModuleIndex, edges: readonly ImportEdge[]): PackageEdge[] {
  return edges
    .filter(({ source, target }) => !reExports(byName, source, target))
    .map(({ source, target }) => ({
      source: packageOf(entryOf(byName, source)),
      target: packageOf(entryOf(byName, target)),
      files: `${entryOf(byName, source).file}\0${entryOf(byName, target).file}`,
    }))
    .filter(({ source, target }) => source !== target);
}

function packageAnchors(modules: readonly PythonModule[]): Map<string, string> {
  const anchor = new Map<string, string>();
  for (const entry of [...modules].sort((left, right) => left.file.localeCompare(right.file))) {
    if (!anchor.has(packageOf(entry)) || entry.module === packageOf(entry)) {
      anchor.set(packageOf(entry), entry.file);
    }
  }
  return anchor;
}

function packageCycles(
  modules: readonly PythonModule[],
  edges: readonly ImportEdge[],
  features: FeatureView,
): Finding[] {
  const byName = new Map(modules.map((entry) => [entry.module, entry]));
  const packaged = packageEdges(byName, edges);
  const anchor = packageAnchors(modules);
  return stronglyConnected([...anchor.keys()], packaged)
    .filter((members) => !isExplainedCycle(members, { packaged, anchor, features }))
    .flatMap((members) =>
      members.map((member) => ({
        tool: COUPLING_TOOL,
        rule: PACKAGE_CYCLE_RULE,
        path: anchor.get(member),
        identity: `cycle:${member}`,
        message: `Package ${member} is in a dependency cycle with ${listed(members.filter((other) => other !== member))}. Move the shared types down into one of them, or invert one dependency behind an interface`,
        classification: ENFORCEABLE,
      })),
    );
}

function moduleCycles(modules: readonly PythonModule[], edges: readonly ImportEdge[]): Finding[] {
  const byName = new Map(modules.map((entry) => [entry.module, entry]));
  const samePackage = edges.filter(
    ({ source, target }) =>
      !reExports(byName, source, target) &&
      packageOf(entryOf(byName, source)) === packageOf(entryOf(byName, target)),
  );
  return stronglyConnected([...byName.keys()], samePackage).flatMap((members) =>
    members.map((member) => ({
      tool: COUPLING_TOOL,
      rule: MODULE_CYCLE_RULE,
      path: entryOf(byName, member).file,
      identity: `module-cycle:${member}`,
      message: `Module ${member} is in an import cycle with ${listed(members.filter((other) => other !== member))}. Move what they share into a module both import, or pass it in instead of importing it back`,
      classification: ENFORCEABLE,
    })),
  );
}

export function cycleFindings(
  report: ImportsReport,
  features: FeatureView = NO_FEATURES,
): Finding[] {
  const edges = runtimeEdges(report);
  return [
    ...packageCycles(report.modules, edges, features),
    ...moduleCycles(report.modules, edges),
  ];
}

function outsideTarget(
  statement: ImportStatement,
  outside: ReadonlyMap<string, OtherModule>,
): string[] {
  if (statement.level !== 0) {
    return [];
  }
  const names =
    statement.module === null
      ? statement.names
      : [statement.module, ...statement.names.map((name) => `${String(statement.module)}.${name}`)];
  const found = names.flatMap((name) => {
    const parts = name.split('.');
    return parts
      .map((_, index) => parts.slice(0, parts.length - index).join('.'))
      .filter((candidate) => outside.has(candidate));
  });
  return found.length === 0
    ? []
    : found.sort((left, right) => right.length - left.length).slice(0, 1);
}

export function outsideRootsFindings({ modules, others = [], imports }: ImportsReport): Finding[] {
  const production = new Set(modules.map(({ module }) => module.split('.')[0]));
  const outside = new Map(
    others
      .filter(({ inRoots, module }) => !(inRoots || production.has(module.split('.')[0])))
      .map((entry) => [entry.module, entry]),
  );
  return modules.flatMap((importer) => {
    const targets = (imports[importer.file] ?? []).flatMap((statement) =>
      outsideTarget(statement, outside),
    );
    return [...new Set(targets)].map((target) => ({
      tool: COUPLING_TOOL,
      rule: OUTSIDE_ROOTS_RULE,
      path: importer.file,
      identity: `outside-roots:${target}`,
      message: `${importer.module} imports ${target} from ${String(outside.get(target)?.file)}, outside the source roots. Production code imports only from python.sourceRoots: move the imported code under a source root, or add its folder to "python.sourceRoots" so the gate checks it`,
      classification: ENFORCEABLE,
    }));
  });
}
