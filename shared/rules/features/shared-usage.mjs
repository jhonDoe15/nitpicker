import { MESSAGES, RULE_IDS, messageFields } from '../../policy.mjs';
import { exceptionText } from '../exceptions.mjs';

export { DEFAULT_FEATURE_LAYOUT, featureRoles } from './feature-roles.mjs';

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
      ...messageFields(MESSAGES.sharedUsedByOneFeature, {
        path: entry.source,
        feature: entry.feature,
        directory: entry.directory,
        exception: exceptionText(rule, entry.source),
      }),
      classification: 'enforceable',
    }));
}
