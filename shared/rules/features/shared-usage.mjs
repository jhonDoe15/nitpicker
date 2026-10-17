import { globMatcher } from '../../glob.mjs';
import { MESSAGES, RULE_IDS, renderMessage } from '../../policy.mjs';
import { exceptionText } from '../exceptions.mjs';

export const DEFAULT_FEATURE_LAYOUT = { sharedRoots: ['**/shared'], featureRoots: ['**/features'] };

function folderPrefixes(file) {
  const parts = file.split('/');
  return parts.slice(1).map((_, index) => ({
    folder: parts.slice(0, index + 1).join('/'),
    child: parts[index + 1],
    isLast: index + 2 === parts.length,
  }));
}

export function featureRoles({ sharedRoots, featureRoots }) {
  const shared = sharedRoots.map((glob) => globMatcher(glob));
  const features = featureRoots.map((glob) => globMatcher(glob));
  return (file) => {
    const prefixes = folderPrefixes(file);
    if (prefixes.some(({ folder }) => shared.some((pattern) => pattern.test(folder)))) {
      return { kind: 'shared' };
    }
    const feature = prefixes.find(
      ({ folder, isLast }) => !isLast && features.some((pattern) => pattern.test(folder)),
    );
    return feature === undefined
      ? { kind: 'other' }
      : { kind: 'feature', directory: `${feature.folder}/${feature.child}` };
  };
}

function importersByTarget(imports) {
  const importers = new Map();
  for (const { from, to } of imports.filter(({ role }) => role !== 'test')) {
    const sources = importers.get(to) ?? new Set();
    importers.set(to, sources);
    sources.add(from);
  }
  return importers;
}

function consumerRoles(start, importers, roleOf) {
  const seen = new Set([start]);
  const pending = [start];
  const consumers = [];
  for (const module of pending) {
    const direct = [...(importers.get(module) ?? [])].filter((importer) => !seen.has(importer));
    for (const importer of direct) {
      seen.add(importer);
    }
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

export function sharedUsedByOneFeature({ modules, imports }, { roleOf }) {
  const importers = importersByTarget(imports);
  return modules
    .filter((source) => roleOf(source).kind === 'shared')
    .toSorted()
    .flatMap((source) => {
      const directory = soleFeature(consumerRoles(source, importers, roleOf));
      return directory === undefined
        ? []
        : [{ source, feature: directory.split('/').at(-1), directory: `${directory}/` }];
    });
}

export function sharedUsageFindings(entries, { analyzerName, isExcepted }) {
  const rule = RULE_IDS.sharedUsedByOneFeature;
  return entries
    .filter(({ source }) => !isExcepted(rule, source))
    .map((entry) => ({
      tool: analyzerName,
      rule,
      path: entry.source,
      identity: rule,
      message: renderMessage(MESSAGES.sharedUsedByOneFeature, {
        path: entry.source,
        feature: entry.feature,
        directory: entry.directory,
        exception: exceptionText(rule, entry.source),
      }),
      classification: 'enforceable',
    }));
}
