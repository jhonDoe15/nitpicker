import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { FOLDER_DEPTH_DEFAULTS } from '../../../../shared/project-rules/size-rules.mjs';
import { CLASSES_REPORT } from '../analysis/python-structure.mts';
import type {
  ClassEntry,
  ClassesReport,
  JsonNull,
  PythonModule,
} from '../analysis/typed/python-graph-types.mts';
import { aliases } from '../imports/import-aliases.mts';
import { entryOf } from '../imports/typed/import-rule-types.mts';
import { classesReportOf } from './typed/classes-report-reader.mts';
import {
  classLimitFindings,
  folderDepthFindings,
  type ClassLimitOptions,
  type DepthEntry,
  type DepthOptions,
  type Depths,
  type Hierarchy,
  type InheritanceDepth,
  type Resolve,
  type SettleContext,
  type SizeFinding,
} from './typed/size-types.mts';

const SIZE_TOOL = 'structure';
const WORDING = {
  subject: 'Package',
  below: 'the root package',
  advice: (limit: number): string =>
    `Keep packages at most ${String(limit)} levels below the root package: group by responsibility instead of nesting.`,
};
const TEST_FOLDERS = new Set(['tests', 'test']);
const UNCOUNTED_KINDS = new Set(['protocol', 'interface']);

function folderParts({ module, isPackage }: PythonModule): string[] {
  const parts = module.split('.');
  return isPackage ? parts : parts.slice(0, -1);
}

function sharedPrefix(left: string[], right: string[]): string[] {
  const divergence = left.findIndex((part, index) => right[index] !== part);
  return divergence === -1 ? left : left.slice(0, divergence);
}

function namespaceDepths(modules: readonly PythonModule[]): Depths {
  const packages = new Set(
    modules.filter(({ isPackage }) => isPackage).map(({ module }) => module),
  );
  const trees = new Map<string | undefined, { shallowest: number; prefix: string[] }>();
  for (const folders of modules.map((entry) => folderParts(entry))) {
    const shallowest = folders.findIndex((_, index) =>
      packages.has(folders.slice(0, index + 1).join('.')),
    );
    const tree = trees.get(folders[0]) ?? { shallowest: Infinity, prefix: folders };
    trees.set(folders[0], {
      shallowest: shallowest === -1 ? tree.shallowest : Math.min(tree.shallowest, shallowest),
      prefix: sharedPrefix(tree.prefix, folders),
    });
  }
  return new Map(
    [...trees].map(([top, { shallowest, prefix }]) => [
      top,
      Number.isFinite(shallowest) ? Math.min(shallowest, prefix.length) : 0,
    ]),
  );
}

function packageParts(entry: PythonModule, depths: Depths): string[] {
  const folders = folderParts(entry);
  return folders.slice(depths.get(folders[0]) ?? 0);
}

function testParts({ file }: { file: string }, sourceRoots: readonly string[]): string[] {
  const inRoot = sourceRoots.find((root) => root !== '.' && file.startsWith(`${root}/`));
  const relative = inRoot === undefined ? file : file.slice(inRoot.length + 1);
  return path.posix
    .dirname(relative)
    .split('/')
    .filter((part) => part !== '.' && !TEST_FOLDERS.has(part));
}

function commonRoot(partsList: string[][]): string[] {
  const voting = partsList.filter((parts) => parts.length > 0);
  if (voting.length === 0) {
    return [];
  }
  const [first = [], ...others] = voting;
  const divergence = first.findIndex((part, index) =>
    others.some((other) => other[index] !== part),
  );
  return first.slice(0, divergence === -1 ? first.length : divergence);
}

function depthBelow(root: string[], parts: string[]): number {
  const underRoot = root.every((part, index) => parts[index] === part);
  return underRoot ? parts.length - root.length : parts.length;
}

export function pythonFolderDepthFindings(
  modules: readonly PythonModule[],
  {
    thresholds = {},
    exceptions,
    tests = [],
    sourceRoots = [],
    rootModules = modules,
  }: DepthOptions,
): SizeFinding[] {
  const based = rootModules.length === 0 ? modules : rootModules;
  const baseDepths = namespaceDepths(based);
  const depths = new Map([...namespaceDepths(modules), ...baseDepths]);
  const root = commonRoot(based.map((entry) => packageParts(entry, baseDepths)));
  const production = modules.map((entry) => packageParts(entry, depths));
  const entries: DepthEntry[] = [
    ...modules.map(({ file }, index) => ({
      path: file,
      kind: 'source',
      parts: production[index] ?? [],
    })),
    ...tests.map((entry) => ({
      path: entry.file,
      kind: 'test',
      parts: testParts(entry, sourceRoots),
    })),
  ];
  return folderDepthFindings(entries, {
    analyzerName: SIZE_TOOL,
    limit: thresholds.folderDepth ?? FOLDER_DEPTH_DEFAULTS.python,
    exceptions,
    wording: WORDING,
    depthOf: ({ parts }) => depthBelow(root, parts),
  });
}

function resolver(report: ClassesReport, modules: readonly PythonModule[]): Resolve {
  const byFile = new Map(modules.map((entry) => [entry.file, entry]));
  const known = new Map<string, ClassEntry>();
  for (const [file, { classes }] of Object.entries(report)) {
    const module = byFile.get(file)?.module;
    for (const entry of module === undefined ? [] : classes) {
      known.set(`${String(module)}.${entry.name}`, entry);
    }
  }
  const names = new Map(
    Object.entries(report).map(([file, { imports }]): [string, ReturnType<typeof aliases>] => [
      file,
      byFile.has(file)
        ? aliases(imports, entryOf(byFile, file))
        : new Map<string, string | JsonNull>(),
    ]),
  );
  return (entry, written) => {
    const [first = '', ...rest] = written.split('.');
    const module = byFile.get(entry.file ?? '')?.module;
    const imported = names.get(entry.file ?? '')?.get(first);
    const local = module === undefined ? undefined : known.get(`${module}.${written}`);
    const fromImport =
      imported === undefined ? undefined : known.get([imported, ...rest].join('.'));
    return local === undefined || local === entry ? fromImport : local;
  };
}

function countedParents(entry: ClassEntry, resolve: Resolve): ClassEntry[] {
  return UNCOUNTED_KINDS.has(entry.kind ?? '')
    ? []
    : entry.bases
        .map((written) => resolve(entry, written))
        .filter(
          (parent): parent is ClassEntry =>
            parent !== undefined && !UNCOUNTED_KINDS.has(parent.kind ?? ''),
        );
}

function deepest(parents: ClassEntry[], depths: Map<ClassEntry, number>): number {
  return Math.max(0, ...parents.map((parent) => 1 + (depths.get(parent) ?? 0)));
}

function hierarchy(entries: ClassEntry[], resolve: Resolve): Hierarchy {
  const parents = new Map(entries.map((entry) => [entry, countedParents(entry, resolve)]));
  const children = new Map<ClassEntry, ClassEntry[]>();
  const waiting = new Map<ClassEntry, number>();
  for (const [entry, list] of parents) {
    waiting.set(entry, list.length);
    for (const parent of list) {
      children.set(parent, [...(children.get(parent) ?? []), entry]);
    }
  }
  return { parents, children, waiting };
}

function settle(entry: ClassEntry, { graph, depths, enqueue }: SettleContext): void {
  const known = (graph.parents.get(entry) ?? []).filter((parent) => depths.has(parent));
  depths.set(entry, deepest(known, depths));
  for (const child of graph.children.get(entry) ?? []) {
    graph.waiting.set(child, (graph.waiting.get(child) ?? 0) - 1);
    if (graph.waiting.get(child) === 0) {
      enqueue(child);
    }
  }
}

function inheritanceDepths(entries: ClassEntry[], resolve: Resolve): InheritanceDepth {
  const graph = hierarchy(entries, resolve);
  const depths = new Map<ClassEntry, number>();
  const queued = new Set<ClassEntry>();
  const ready: ClassEntry[] = [];
  function enqueue(entry: ClassEntry): void {
    if (!queued.has(entry)) {
      queued.add(entry);
      ready.push(entry);
    }
  }
  for (const entry of entries.filter((candidate) => graph.waiting.get(candidate) === 0)) {
    enqueue(entry);
  }
  for (const entry of ready) {
    settle(entry, { graph, depths, enqueue });
    const stuck = entry === ready.at(-1) ? entries.find((other) => !queued.has(other)) : undefined;
    if (stuck !== undefined) {
      enqueue(stuck);
    }
  }
  return (entry) => depths.get(entry);
}

export function readClassesReport(reportRoot: string): ClassesReport {
  const report = path.join(reportRoot, CLASSES_REPORT);
  if (!existsSync(report)) {
    throw new Error(
      `The ${CLASSES_REPORT} report is missing from ${reportRoot}: the structure step did not write it, so the class limits cannot be checked`,
    );
  }
  return classesReportOf(readFileSync(report, 'utf8'));
}

export function pythonClassLimitFindings(
  report: ClassesReport,
  modules: readonly PythonModule[],
  { thresholds, exceptions }: ClassLimitOptions,
): SizeFinding[] {
  const production = new Set(modules.map(({ file }) => file));
  const entries = Object.entries(report)
    .filter(([file]) => production.has(file))
    .flatMap(([, { classes: found }]) => found);
  const depthOf = inheritanceDepths(entries, resolver(report, modules));
  const classes = entries.map((entry) => ({ ...entry, inheritanceDepth: depthOf(entry) }));
  return classLimitFindings(classes, { analyzerName: SIZE_TOOL, thresholds, exceptions });
}
