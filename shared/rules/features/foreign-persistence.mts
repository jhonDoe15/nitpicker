import { appendAll } from '../../lists/lists.mts';
import { RULE_IDS } from '../../policy.mts';
import { reexportSteps } from '../facts/fact-graph.mts';
import { featureFinding, productionImports, sortedBy } from './feature-boundaries.mts';
import type { Finding } from '../../values/findings.mts';
import type { FactImport, FactModule } from '../facts/typed/fact-types.mts';
import type { ReexportStep } from '../facts/fact-graph.mts';
import type { FeatureContext, RoleLike, RoleOf } from './typed/role-types.mts';

type Hit = ReexportStep & { readonly via: readonly string[] };

type PersistenceIndex = {
  readonly persistence: ReadonlyMap<string, string | undefined>;
  readonly reexports: ReadonlyMap<string, readonly FactImport[]>;
};

type Use = {
  readonly importer: string;
  readonly target: string;
  readonly via: readonly string[];
  readonly kind: string | undefined;
};

const KIND_WORDS: Readonly<Record<string, string>> = {
  entity: 'persistent entity',
  'data-access': 'data access module',
};

function reexportIndex(imports: readonly FactImport[]): Map<string, FactImport[]> {
  const index = new Map<string, FactImport[]>();
  for (const record of productionImports(imports).filter(({ reexport }) => reexport === true)) {
    index.set(record.from, [...(index.get(record.from) ?? []), record]);
  }
  return index;
}

function stepsFrom(step: Hit, reexports: PersistenceIndex['reexports']): Hit[] {
  const via = [...step.via, step.file];
  return reexportSteps(reexports.get(step.file) ?? [], step.name).map((target) => ({
    ...target,
    via,
  }));
}

function reexportedHits(
  record: FactImport,
  { persistence, reexports }: PersistenceIndex,
): Map<string, readonly string[]> {
  const hits = new Map<string, readonly string[]>();
  const seen = new Set<string>();
  const pending: Hit[] = record.names.map(({ name }) => ({ file: record.to, name, via: [] }));
  for (const step of pending) {
    const key = JSON.stringify([step.file, step.name]);
    const fresh = !seen.has(key);
    seen.add(key);
    const hit = fresh && step.via.length > 0 && persistence.has(step.file);
    if (hit && !hits.has(step.file)) {
      hits.set(step.file, step.via);
    }
    if (fresh && !hit) {
      appendAll(pending, stepsFrom(step, reexports));
    }
  }
  return hits;
}

function persistentTargets(
  record: FactImport,
  index: PersistenceIndex,
): Map<string, readonly string[]> {
  return index.persistence.has(record.to)
    ? new Map([[record.to, []]])
    : reexportedHits(record, index);
}

function featureName(role: RoleLike): string {
  return (role.directory ?? '').split('/').at(-1) ?? '';
}

function isForeign(source: RoleLike, target: RoleLike): boolean {
  return (
    source.kind === 'feature' && target.kind === 'feature' && source.directory !== target.directory
  );
}

function usesOf(record: FactImport, index: PersistenceIndex, roleOf: RoleOf): Use[] {
  return [...persistentTargets(record, index)]
    .filter(([target]) => isForeign(roleOf(record.from), roleOf(target)))
    .map(([target, via]) => ({
      importer: record.from,
      target,
      via,
      kind: index.persistence.get(target),
    }));
}

function foreignUses(
  {
    modules,
    imports,
  }: { readonly modules: readonly FactModule[]; readonly imports: readonly FactImport[] },
  roleOf: RoleOf,
): Use[] {
  const index: PersistenceIndex = {
    persistence: new Map(
      modules
        .filter(({ persistence }) => persistence !== undefined)
        .map(({ file, persistence }): [string, string | undefined] => [file, persistence]),
    ),
    reexports: reexportIndex(imports),
  };
  const uses = new Map<string, Use>();
  for (const use of productionImports(imports).flatMap((record) => usesOf(record, index, roleOf))) {
    const key = JSON.stringify([use.importer, use.target]);
    if (!uses.has(key)) {
      uses.set(key, use);
    }
  }
  return [...uses.values()];
}

export function foreignPersistenceFindings(
  facts: { readonly modules: readonly FactModule[]; readonly imports: readonly FactImport[] },
  context: FeatureContext,
): Finding[] {
  const rule = RULE_IDS.foreignFeaturePersistence;
  const uses = foreignUses(facts, context.roleOf).filter(
    ({ target }) => !context.isExcepted(rule, target),
  );
  return sortedBy(uses, ({ importer, target }) => `${importer}\0${target}`).flatMap(
    ({ importer, target, via, kind }) =>
      featureFinding(
        rule,
        {
          importer,
          identity: `foreign-persistence:${target}`,
          message: 'foreignFeaturePersistence',
          values: {
            importer,
            target,
            source: featureName(context.roleOf(importer)),
            feature: featureName(context.roleOf(target)),
            kind: kind === undefined ? undefined : KIND_WORDS[kind],
            via: via.length === 0 ? '' : ` through ${via.join(', ')}`,
          },
        },
        context,
      ),
  );
}
