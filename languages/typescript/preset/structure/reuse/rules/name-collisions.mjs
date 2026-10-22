import { RULE_IDS } from '../../../../../../shared/policy.mjs';
import { listPaths, reuseFinding } from '../finding.mjs';

const COLLISION_FIX = 'Rename one, or alias both imports.';

function mergedDefinitions(definitions) {
  const byName = new Map();
  for (const definition of definitions) {
    const known = byName.get(definition.name);
    byName.set(definition.name, {
      key: known === undefined ? definition.key : `${known.key}+${definition.key}`,
      exported: (known?.exported ?? false) || definition.exported,
      line: known?.line ?? definition.line,
    });
  }
  return byName;
}

function moduleIndex(facts) {
  return new Map(
    facts.map((fact) => [
      fact.path,
      {
        definitions: mergedDefinitions(fact.definitions),
        locals: new Map(fact.exports.locals.map(({ local, exported }) => [exported, local])),
        bindings: new Map(
          fact.imports.flatMap(({ specifier, named }) =>
            named.map(({ local, imported }) => [local, { specifier, name: imported }]),
          ),
        ),
        reexports: fact.exports.reexports,
      },
    ]),
  );
}

function reexportTargets(entry, name) {
  return entry.reexports.flatMap(({ specifier, star, names }) =>
    star
      ? [{ specifier, name }]
      : names
          .filter(({ exported }) => exported === name)
          .map(({ imported }) => ({ specifier, name: imported })),
  );
}

function exportedLocal(entry, name) {
  return entry.locals.get(name) ?? (entry.definitions.get(name)?.exported ? name : undefined);
}

function nextSteps({ entry, step, local, resolve }) {
  const binding = local === undefined ? undefined : entry.bindings.get(local);
  return [...(binding === undefined ? [] : [binding]), ...reexportTargets(entry, step.name)]
    .map((target) => ({ target, resolved: resolve(target.specifier, step.path) }))
    .filter(({ resolved }) => resolved.path !== undefined)
    .map(({ target, resolved }) => ({ path: resolved.path, name: target.name }));
}

function findOrigin(index, resolve, start) {
  const seen = new Set();
  const pending = [start];
  for (const step of pending) {
    const visit = `${step.path}\0${step.name}`;
    const entry = seen.has(visit) ? undefined : index.get(step.path);
    seen.add(visit);
    const local = entry === undefined ? undefined : exportedLocal(entry, step.name);
    if (local !== undefined && entry.definitions.has(local)) {
      return { path: step.path, name: local };
    }
    if (entry !== undefined) pending.push(...nextSteps({ entry, step, local, resolve }));
  }
  return undefined;
}

function importedOrigins(fact, { index, resolve }) {
  return fact.imports.flatMap((declaration) => {
    const target = resolve(declaration.specifier, fact.path);
    return target.path === undefined
      ? []
      : declaration.named.map(({ imported, local }) => ({
          name: imported,
          keepsName: local === imported,
          origin: findOrigin(index, resolve, { path: target.path, name: imported }),
        }));
  });
}

function collisionsIn(fact, context) {
  const found = importedOrigins(fact, context).filter(
    ({ origin }) =>
      origin !== undefined && !context.isExcepted(RULE_IDS.exportedNameCollision, origin.path),
  );
  const byName = new Map();
  for (const { name, origin, keepsName } of found) {
    const group = byName.get(name) ?? { origins: new Map(), keepsName: false };
    group.origins.set(`${origin.path}\0${origin.name}`, origin);
    group.keepsName = group.keepsName || keepsName;
    byName.set(name, group);
  }
  return [...byName]
    .filter(([, { keepsName }]) => keepsName)
    .map(([name, { origins }]) => ({
      name,
      importer: fact.path,
      origins: [...origins.values()],
    }));
}

function keyOf(origin, index) {
  return index.get(origin.path).definitions.get(origin.name).key;
}

function collisionEntries(collision, index) {
  return collision.origins.flatMap((origin) => {
    const others = collision.origins.filter(
      (other) => keyOf(other, index) !== keyOf(origin, index),
    );
    return others.length === 0
      ? []
      : [
          {
            origin,
            name: collision.name,
            importer: collision.importer,
            others: others.map(({ path: p }) => p),
          },
        ];
  });
}

function mergeEntries(entries) {
  const merged = new Map();
  for (const entry of entries) {
    const key = `${entry.origin.path}\0${entry.name}`;
    const known = merged.get(key);
    merged.set(key, {
      ...entry,
      importer: known === undefined ? entry.importer : [known.importer, entry.importer].sort()[0],
      others: [...new Set([...(known?.others ?? []), ...entry.others])].sort(),
    });
  }
  return [...merged.values()];
}

export function exportedNameCollisionFindings(facts, context) {
  const index = moduleIndex(facts);
  const environment = { ...context, index };
  const entries = facts
    .flatMap((fact) => collisionsIn(fact, environment))
    .flatMap((collision) => collisionEntries(collision, index));
  return mergeEntries(entries).map(({ origin, name, importer, others }) =>
    reuseFinding(context.analyzerName, {
      key: 'exportedNameCollision',
      path: origin.path,
      identity: `collision:${name}`,
      symbol: name,
      line: index.get(origin.path).definitions.get(origin.name).line,
      values: { name, others: listPaths(others), importer, fix: COLLISION_FIX },
    }),
  );
}
