import { RULE_IDS } from '../../policy.mjs';
import { groupBy, reexportSteps } from '../facts/fact-graph.mjs';
import { listPaths, reuseFinding } from './reuse-finding.mjs';

const COLLISION_FIX = 'Rename one, or alias both imports.';

function localKey(definition) {
  return definition.qualifier ?? definition.name;
}

function mergedDefinitions(definitions) {
  const byName = new Map();
  for (const definition of definitions) {
    const known = byName.get(localKey(definition));
    byName.set(localKey(definition), {
      key: known === undefined ? definition.key : `${known.key}+${definition.key}`,
      exported: (known?.exported ?? false) || definition.exported,
      overloads: (known?.overloads ?? true) && definition.overloads === true,
      line: known?.line ?? definition.line,
    });
  }
  return byName;
}

function exportIndex(definitions) {
  const byExport = new Map();
  for (const definition of definitions) {
    for (const exported of definition.exportNames) {
      byExport.set(exported, localKey(definition));
    }
  }
  return byExport;
}

function moduleIndex(modules, imports) {
  const index = new Map(
    modules.map((module) => [
      module.path,
      {
        definitions: mergedDefinitions(module.definitions),
        exports: exportIndex(module.definitions),
        reexports: [],
      },
    ]),
  );
  const reexports = imports.filter(({ reexport, role }) => reexport && role !== 'test');
  for (const record of reexports) {
    const entry = index.get(record.from) ?? {
      definitions: new Map(),
      exports: new Map(),
      reexports: [],
    };
    entry.reexports.push(record);
    index.set(record.from, entry);
  }
  return index;
}

function findOrigin(index, start) {
  const seen = new Set();
  const pending = [start];
  for (const step of pending) {
    const visit = `${step.file}\0${step.name}`;
    const entry = seen.has(visit) || step.name === '*' ? undefined : index.get(step.file);
    seen.add(visit);
    const local = entry?.exports.get(step.name);
    if (local !== undefined && entry.definitions.has(local)) {
      return { path: step.file, name: local };
    }
    pending.push(...reexportSteps(entry?.reexports ?? [], step.name));
  }
  return undefined;
}

function importedOrigins(path, { index, importsByFile }) {
  return (importsByFile.get(path) ?? []).flatMap(({ to, names }) =>
    names
      .filter(({ name }) => name !== '*')
      .map(({ name, alias }) => ({
        name,
        keepsName: alias === undefined || alias === name,
        origin: findOrigin(index, { file: to, name }),
      })),
  );
}

function isOverload(index, origin) {
  return index.get(origin.path).definitions.get(origin.name).overloads;
}

function collisionsIn(path, context) {
  const found = importedOrigins(path, context).filter(
    ({ origin }) =>
      origin !== undefined &&
      !isOverload(context.index, origin) &&
      !context.isExcepted(RULE_IDS.exportedNameCollision, origin.path),
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
      importer: path,
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

function importsByImporter(imports) {
  return groupBy(
    imports.filter(({ reexport, role }) => !reexport && role !== 'test'),
    ({ from }) => from,
  );
}

export function exportedNameCollisionFindings(modules, imports, context) {
  const index = moduleIndex(modules, imports);
  const importsByFile = importsByImporter(imports);
  const environment = { ...context, index, importsByFile };
  const importers = [...importsByFile.keys()].toSorted();
  const entries = importers
    .flatMap((importer) => collisionsIn(importer, environment))
    .flatMap((collision) => collisionEntries(collision, index));
  return mergeEntries(entries).map(({ origin, name, importer, others }) =>
    reuseFinding(context.analyzerName, {
      key: 'exportedNameCollision',
      path: origin.path,
      identity: `collision:${name}`,
      symbol: name,
      line: index.get(origin.path).definitions.get(origin.name).line,
      values: {
        name,
        others: listPaths(others),
        importer,
        fix: context.fixFor?.(importer) ?? COLLISION_FIX,
      },
    }),
  );
}
