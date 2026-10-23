import { RULE_IDS } from '../../policy.mjs';
import { reexportSteps } from '../facts/fact-graph.mjs';
import { featureFinding, productionImports, sortedBy } from './feature-boundaries.mjs';

const KIND_WORDS = { entity: 'persistent entity', 'data-access': 'data access module' };

function reexportIndex(imports) {
  const index = new Map();
  for (const record of productionImports(imports).filter(({ reexport }) => reexport === true)) {
    index.set(record.from, [...(index.get(record.from) ?? []), record]);
  }
  return index;
}

function stepsFrom(step, reexports) {
  const via = [...step.via, step.file];
  return reexportSteps(reexports.get(step.file) ?? [], step.name).map((target) => ({
    ...target,
    via,
  }));
}

function reexportedHits(record, { persistence, reexports }) {
  const hits = new Map();
  const seen = new Set();
  const pending = record.names.map(({ name }) => ({ file: record.to, name, via: [] }));
  for (const step of pending) {
    const key = `${step.file}\0${step.name}`;
    const fresh = !seen.has(key);
    seen.add(key);
    const hit = fresh && step.via.length > 0 && persistence.has(step.file);
    if (hit && !hits.has(step.file)) {
      hits.set(step.file, step.via);
    }
    if (fresh && !hit) {
      pending.push(...stepsFrom(step, reexports));
    }
  }
  return hits;
}

function persistentTargets(record, index) {
  return index.persistence.has(record.to)
    ? new Map([[record.to, []]])
    : reexportedHits(record, index);
}

function featureName(role) {
  return role.directory.split('/').at(-1);
}

function isForeign(source, target) {
  return (
    source.kind === 'feature' && target.kind === 'feature' && source.directory !== target.directory
  );
}

function usesOf(record, index, roleOf) {
  return [...persistentTargets(record, index)]
    .filter(([target]) => isForeign(roleOf(record.from), roleOf(target)))
    .map(([target, via]) => ({
      importer: record.from,
      target,
      via,
      kind: index.persistence.get(target),
    }));
}

function foreignUses({ modules, imports }, roleOf) {
  const index = {
    persistence: new Map(
      modules
        .filter(({ persistence }) => persistence !== undefined)
        .map(({ file, persistence }) => [file, persistence]),
    ),
    reexports: reexportIndex(imports),
  };
  const uses = new Map();
  for (const use of productionImports(imports).flatMap((record) => usesOf(record, index, roleOf))) {
    const key = `${use.importer}\0${use.target}`;
    if (!uses.has(key)) {
      uses.set(key, use);
    }
  }
  return [...uses.values()];
}

export function foreignPersistenceFindings(facts, context) {
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
            kind: KIND_WORDS[kind],
            via: via.length === 0 ? '' : ` through ${via.join(', ')}`,
          },
        },
        context,
      ),
  );
}
