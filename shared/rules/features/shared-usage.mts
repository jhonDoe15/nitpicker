import { MESSAGES, RULE_IDS } from '../../policy.mts';
import { exceptionText } from '../exceptions.mts';
import { appendAll } from '../../lists/lists.mts';
import { fieldOf } from '../../values/readers.mts';
import type { Finding } from '../../values/findings.mts';
import type { FactImport, RuleContext } from '../facts/typed/fact-types.mts';
import { messageParts } from '../facts/typed/message-parts.mts';
import { isFeatureSide } from './feature-roles.mts';
import type { FeatureSide, RoleLike, RoleOf } from './typed/role-types.mts';

type SharedImport = Pick<FactImport, 'from' | 'to' | 'role'>;

export type SharedEntry = {
  readonly source: string;
  readonly feature: string;
  readonly directory: string;
};

function importersByTarget(imports: readonly SharedImport[]): Map<string, Set<string>> {
  const importers = new Map<string, Set<string>>();
  for (const { from, to } of imports.filter(({ role }) => role !== 'test')) {
    const sources = importers.get(to) ?? new Set<string>();
    importers.set(to, sources);
    sources.add(from);
  }
  return importers;
}

function consumerRoles(
  start: string,
  importers: ReadonlyMap<string, ReadonlySet<string>>,
  roleOf: RoleOf,
): RoleLike[] {
  const seen = new Set([start]);
  const pending = [start];
  const consumers: RoleLike[] = [];
  for (const module of pending) {
    const direct = [...(importers.get(module) ?? [])].filter((importer) => !seen.has(importer));
    for (const importer of direct) {
      seen.add(importer);
    }
    const roles = direct.map((importer) => ({ importer, role: roleOf(importer) }));
    appendAll(
      pending,
      roles.filter(({ role }) => role.kind === 'shared').map(({ importer }) => importer),
    );
    appendAll(
      consumers,
      roles.map(({ role }) => role).filter(({ kind }) => kind !== 'shared'),
    );
  }
  return consumers;
}

function soleFeature(consumers: readonly RoleLike[]): FeatureSide | undefined {
  const directories = new Set(consumers.map(({ directory }) => directory));
  const [first] = consumers;
  return directories.size === 1 && first !== undefined && isFeatureSide(first) ? first : undefined;
}

export function sharedUsedByOneFeature(
  {
    modules,
    imports,
  }: { readonly modules: readonly string[]; readonly imports: readonly SharedImport[] },
  { roleOf }: { readonly roleOf: RoleOf },
): SharedEntry[] {
  const importers = importersByTarget(imports);
  return modules
    .filter((source) => roleOf(source).kind === 'shared')
    .toSorted()
    .flatMap((source) => {
      const feature = soleFeature(consumerRoles(source, importers, roleOf));
      return feature === undefined
        ? []
        : [{ source, feature: feature.name, directory: `${feature.directory}/` }];
    });
}

function isSharedEntry(value: unknown): value is SharedEntry {
  return ['source', 'feature', 'directory'].every((key) => typeof fieldOf(value, key) === 'string');
}

export function sharedUsageFindings(
  entries: readonly unknown[],
  { analyzerName, isExcepted }: RuleContext,
): Finding[] {
  const rule = RULE_IDS.sharedUsedByOneFeature;
  return entries
    .filter(isSharedEntry)
    .filter(({ source }) => !isExcepted(rule, source))
    .map((entry) => ({
      tool: analyzerName,
      rule,
      path: entry.source,
      identity: rule,
      ...messageParts(MESSAGES.sharedUsedByOneFeature, {
        path: entry.source,
        feature: entry.feature,
        directory: entry.directory,
        exception: exceptionText(rule, entry.source),
      }),
      classification: 'enforceable',
    }));
}
