import { layoutFeatures } from '../architecture/strict-layout.mjs';
import { normalizePath } from '../dependency-graph/cruise.mjs';

const SHARED = new RegExp(layoutFeatures.shared);
const FEATURE = new RegExp(`${layoutFeatures.feature}/`);

function roleOf(file) {
  if (SHARED.test(file)) {
    return { kind: 'shared' };
  }
  const match = FEATURE.exec(file);
  return match === null
    ? { kind: 'other' }
    : { kind: 'feature', directory: file.slice(0, match.index + match[0].length - 1) };
}

function importersByTarget(graph, isProduction) {
  const importers = new Map();
  for (const module of graph.modules) {
    const source = normalizePath(module.source);
    const dependencies = isProduction(source) ? (module.dependencies ?? []) : [];
    for (const { resolved } of dependencies) {
      const target = normalizePath(resolved ?? '');
      const sources = importers.get(target) ?? new Set();
      importers.set(target, sources);
      sources.add(source);
    }
  }
  return importers;
}

function consumerRoles(start, importers) {
  const seen = new Set([start]);
  const pending = [start];
  const consumers = [];
  for (const module of pending) {
    const direct = [...(importers.get(module) ?? [])].filter((importer) => !seen.has(importer));
    for (const importer of direct) seen.add(importer);
    const roles = direct.map((importer) => ({ importer, role: roleOf(importer) }));
    pending.push(
      ...roles.filter(({ role }) => role.kind === 'shared').map(({ importer }) => importer),
    );
    consumers.push(...roles.map(({ role }) => role).filter(({ kind }) => kind !== 'shared'));
  }
  return consumers;
}

function soleFeature(consumers) {
  const directories = new Set(consumers.map(({ directory }) => directory));
  const [directory] = directories;
  return directories.size === 1 && directory !== undefined ? directory : undefined;
}

export function sharedUsedByOneFeature(graph, { sourceRoot, isProduction }) {
  const root = normalizePath(sourceRoot).replace(/\/$/u, '');
  const importers = importersByTarget(graph, isProduction);
  return graph.modules
    .map((module) => normalizePath(module.source))
    .filter(
      (source) =>
        source.startsWith(`${root}/`) && isProduction(source) && roleOf(source).kind === 'shared',
    )
    .toSorted()
    .flatMap((source) => {
      const directory = soleFeature(consumerRoles(source, importers));
      return directory === undefined
        ? []
        : [{ source, feature: directory.split('/').at(-1), directory: `${directory}/` }];
    });
}
