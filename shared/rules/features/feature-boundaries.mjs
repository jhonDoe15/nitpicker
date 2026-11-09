import { MESSAGES, RULE_IDS, renderMessage } from '../../policy.mjs';
import { exceptionText } from '../exceptions.mjs';

const LISTED = 5;

export function listed(items) {
  const shown = items.slice(0, LISTED).join(', ');
  return items.length > LISTED ? `${shown} and ${String(items.length - LISTED)} more` : shown;
}

export function sortedBy(entries, keyOf) {
  return entries.toSorted((left, right) => keyOf(left).localeCompare(keyOf(right)));
}

export function productionImports(imports) {
  return imports.filter(({ from, to, role }) => role !== 'test' && from !== to);
}

export function groupedByImporter(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.importer}\0${entry.feature.directory}`;
    const group = groups.get(key) ?? { ...entry, targets: new Set() };
    group.targets.add(entry.target);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, targets: [...group.targets].sort() }));
}

export function featureFinding(rule, entry, { analyzerName, isExcepted }) {
  if (isExcepted(rule, entry.importer)) {
    return [];
  }
  return [
    {
      tool: analyzerName,
      rule,
      path: entry.importer,
      identity: entry.identity,
      message: renderMessage(MESSAGES[entry.message], {
        ...entry.values,
        exception: exceptionText(rule, entry.importer),
      }),
      classification: 'enforceable',
    },
  ];
}

function isOutside(source, target) {
  return (
    source.kind === 'other' || (source.kind === 'feature' && source.directory !== target.directory)
  );
}

const WHOLE_MODULE = '*';

function isWholeReexport({ from, to, reexport, names }, roleOf) {
  const source = roleOf(from);
  return (
    reexport === true &&
    names.some(({ name }) => name === WHOLE_MODULE) &&
    source.kind === 'feature' &&
    source.isPublic &&
    roleOf(to).directory === source.directory
  );
}

function publicModules(imports, roleOf) {
  return new Set(imports.filter((edge) => isWholeReexport(edge, roleOf)).map(({ to }) => to));
}

function featureInternalImports({ imports }, roleOf) {
  const seen = new Set();
  const production = productionImports(imports);
  const reexported = publicModules(production, roleOf);
  return production.flatMap(({ from, to }) => {
    const target = roleOf(to);
    const key = `${from}\0${to}`;
    if (
      target.kind !== 'feature' ||
      target.isPublic ||
      reexported.has(to) ||
      seen.has(key) ||
      !isOutside(roleOf(from), target)
    ) {
      return [];
    }
    seen.add(key);
    return [{ importer: from, target: to, feature: target }];
  });
}

export function featureInternalImportFindings(facts, context) {
  const rule = RULE_IDS.featureInternalImport;
  return sortedBy(
    featureInternalImports(facts, context.roleOf),
    ({ importer, target }) => `${importer}\0${target}`,
  ).flatMap(({ importer, target, feature }) =>
    featureFinding(
      rule,
      {
        importer,
        identity: `feature-internal:${target}`,
        message: 'featureInternalImport',
        values: { importer, target, feature: feature.name, face: feature.face },
      },
      context,
    ),
  );
}

function sharedFeatureImports({ imports }, roleOf) {
  return groupedByImporter(
    productionImports(imports)
      .map(({ from, to }) => ({
        importer: from,
        target: to,
        source: roleOf(from),
        feature: roleOf(to),
      }))
      .filter(({ source, feature }) => source.kind === 'shared' && feature.kind === 'feature'),
  );
}

export function sharedImportsFeatureFindings(facts, context) {
  const rule = RULE_IDS.sharedImportsFeature;
  return sortedBy(
    sharedFeatureImports(facts, context.roleOf),
    ({ importer, feature }) => `${importer}\0${feature.directory}`,
  ).flatMap(({ importer, feature, targets }) =>
    featureFinding(
      rule,
      {
        importer,
        identity: `${feature.directory}|${rule}`,
        message: 'sharedImportsFeature',
        values: { importer, feature: feature.name, targets: listed(targets) },
      },
      context,
    ),
  );
}
