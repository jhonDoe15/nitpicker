import { RULE_IDS, renderMessage } from '../../policy.mts';
import { exceptionText } from '../exceptions.mts';
import { limitedList } from '../../messages/format/limited-list.mts';
import { byText } from '../../text-order/by-text.mts';
import type { MessageValues } from '../../messages/messages.mts';
import type { Finding } from '../../values/findings.mts';
import type { FactImport, RuleContext } from '../facts/typed/fact-types.mts';
import { messageTemplate } from '../facts/typed/message-parts.mts';
import { isFeatureSide } from './feature-roles.mts';
import type { FeatureContext, FeatureSide, RoleLike, RoleOf } from './typed/role-types.mts';

const LISTED = 5;

type Grouped = {
  readonly importer: string;
  readonly target: string;
  readonly feature: { readonly directory: string };
};

type FeatureEntry = {
  readonly importer: string;
  readonly identity: string;
  readonly message: string;
  readonly values: MessageValues;
};

type ImportEdge = { readonly imports: readonly FactImport[] };

export function listed(items: readonly string[]): string {
  return limitedList(items, LISTED);
}

export function sortedBy<Item>(entries: readonly Item[], keyOf: (entry: Item) => string): Item[] {
  return entries.toSorted((left, right) => keyOf(left).localeCompare(keyOf(right)));
}

export function productionImports<Edge extends Pick<FactImport, 'from' | 'to' | 'role'>>(
  imports: readonly Edge[],
): Edge[] {
  return imports.filter(({ from, to, role }) => role !== 'test' && from !== to);
}

export function groupedByImporter<Entry extends Grouped>(
  entries: readonly Entry[],
): (Entry & { readonly targets: string[] })[] {
  const groups = new Map<string, { readonly entry: Entry; readonly targets: Set<string> }>();
  for (const entry of entries) {
    const key = JSON.stringify([entry.importer, entry.feature.directory]);
    const group = groups.get(key) ?? { entry, targets: new Set<string>() };
    group.targets.add(entry.target);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ entry, targets }) => ({
    ...entry,
    targets: [...targets].sort(byText),
  }));
}

export function featureFinding(
  rule: string,
  entry: FeatureEntry,
  { analyzerName, isExcepted }: RuleContext,
): Finding[] {
  if (isExcepted(rule, entry.importer)) {
    return [];
  }
  return [
    {
      tool: analyzerName,
      rule,
      path: entry.importer,
      identity: entry.identity,
      message: renderMessage(messageTemplate(entry.message), {
        ...entry.values,
        exception: exceptionText(rule, entry.importer),
      }),
      classification: 'enforceable',
    },
  ];
}

function isOutside(source: RoleLike, target: RoleLike): boolean {
  return (
    source.kind === 'other' || (source.kind === 'feature' && source.directory !== target.directory)
  );
}

const WHOLE_MODULE = '*';

function isWholeReexport({ from, to, reexport, names }: FactImport, roleOf: RoleOf): boolean {
  const source = roleOf(from);
  return (
    reexport === true &&
    names.some(({ name }) => name === WHOLE_MODULE) &&
    source.kind === 'feature' &&
    source.isPublic === true &&
    roleOf(to).directory === source.directory
  );
}

function publicModules(imports: readonly FactImport[], roleOf: RoleOf): Set<string> {
  return new Set(imports.filter((edge) => isWholeReexport(edge, roleOf)).map(({ to }) => to));
}

function featureInternalImports(
  { imports }: ImportEdge,
  roleOf: RoleOf,
): { importer: string; target: string; feature: FeatureSide }[] {
  const seen = new Set<string>();
  const production = productionImports(imports);
  const reexported = publicModules(production, roleOf);
  return production.flatMap(({ from, to }) => {
    const target = roleOf(to);
    const key = JSON.stringify([from, to]);
    if (
      !isFeatureSide(target) ||
      target.isPublic === true ||
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

export function featureInternalImportFindings(
  facts: ImportEdge,
  context: FeatureContext,
): Finding[] {
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

function sharedFeatureImports({ imports }: ImportEdge, roleOf: RoleOf) {
  return groupedByImporter(
    productionImports(imports).flatMap(({ from, to }) => {
      const [source, feature] = [roleOf(from), roleOf(to)];
      return source.kind === 'shared' && isFeatureSide(feature)
        ? [{ importer: from, target: to, source, feature }]
        : [];
    }),
  );
}

export function sharedImportsFeatureFindings(
  facts: ImportEdge,
  context: FeatureContext,
): Finding[] {
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
