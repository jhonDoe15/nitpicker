import { RULE_IDS } from '../../policy.mts';
import { appendAll } from '../../lists/lists.mts';
import type { Finding } from '../../values/findings.mts';
import { groupBy, reexportSteps, type ReexportStep } from '../facts/fact-graph.mts';
import type { FactImport } from '../facts/typed/fact-types.mts';
import type { ReuseDefinition } from '../facts/typed/reuse-module-types.mts';
import { listPaths, reuseFinding } from './reuse-finding.mts';
import type {
  Collision,
  CollisionContext,
  CollisionEntry,
  Environment,
  MergedDefinition,
  ModuleEntry,
  ModuleIndex,
  Origin,
} from './typed/collision-types.mts';
import type { CopyModule } from './typed/reuse-types.mts';

const COLLISION_FIX = 'Rename one, or alias both imports.';

function localKey(definition: ReuseDefinition): string {
  return definition.qualifier ?? definition.name;
}

function mergedDefinitions(definitions: readonly ReuseDefinition[]): Map<string, MergedDefinition> {
  const byName = new Map<string, MergedDefinition>();
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

function exportIndex(definitions: readonly ReuseDefinition[]): Map<string, string> {
  const byExport = new Map<string, string>();
  for (const definition of definitions) {
    for (const exported of definition.exportNames) {
      byExport.set(exported, localKey(definition));
    }
  }
  return byExport;
}

function moduleIndex(
  modules: readonly CopyModule[],
  imports: readonly FactImport[],
): Map<string, ModuleEntry> {
  const index = new Map<string, ModuleEntry>(
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
    const entry: ModuleEntry = index.get(record.from) ?? {
      definitions: new Map(),
      exports: new Map(),
      reexports: [],
    };
    entry.reexports.push(record);
    index.set(record.from, entry);
  }
  return index;
}

function findOrigin(index: ModuleIndex, start: ReexportStep): Origin | undefined {
  const seen = new Set<string>();
  const pending = [start];
  for (const step of pending) {
    const visit = JSON.stringify([step.file, step.name]);
    const entry = seen.has(visit) || step.name === '*' ? undefined : index.get(step.file);
    seen.add(visit);
    const local = entry?.exports.get(step.name);
    if (entry !== undefined && local !== undefined && entry.definitions.has(local)) {
      return { path: step.file, name: local };
    }
    appendAll(pending, reexportSteps(entry?.reexports ?? [], step.name));
  }
  return undefined;
}

function importedOrigins(
  path: string,
  { index, importsByFile }: Environment,
): { name: string; keepsName: boolean; origin: Origin | undefined }[] {
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

function definitionOf(index: ModuleIndex, origin: Origin): MergedDefinition | undefined {
  return index.get(origin.path)?.definitions.get(origin.name);
}

function isOverload(index: ModuleIndex, origin: Origin): boolean {
  return definitionOf(index, origin)?.overloads === true;
}

function collisionsIn(path: string, context: Environment): Collision[] {
  const found = importedOrigins(path, context).flatMap(({ name, keepsName, origin }) =>
    origin !== undefined &&
    !isOverload(context.index, origin) &&
    !context.isExcepted(RULE_IDS.exportedNameCollision, origin.path)
      ? [{ name, keepsName, origin }]
      : [],
  );
  const byName = new Map<string, { origins: Map<string, Origin>; keepsName: boolean }>();
  for (const { name, origin, keepsName } of found) {
    const group = byName.get(name) ?? { origins: new Map<string, Origin>(), keepsName: false };
    group.origins.set(JSON.stringify([origin.path, origin.name]), origin);
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

function keyOf(origin: Origin, index: ModuleIndex): string | undefined {
  return definitionOf(index, origin)?.key;
}

function collisionEntries(collision: Collision, index: ModuleIndex): CollisionEntry[] {
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

function earlierImporter(known: CollisionEntry | undefined, entry: CollisionEntry): string {
  if (known === undefined || entry.importer <= known.importer) {
    return entry.importer;
  }
  return known.importer;
}

function mergeEntries(entries: readonly CollisionEntry[]): CollisionEntry[] {
  const merged = new Map<string, CollisionEntry>();
  for (const entry of entries) {
    const key = JSON.stringify([entry.origin.path, entry.name]);
    const known = merged.get(key);
    merged.set(key, {
      ...entry,
      importer: earlierImporter(known, entry),
      others: [...new Set([...(known?.others ?? []), ...entry.others])].sort(),
    });
  }
  return [...merged.values()];
}

function importsByImporter(imports: readonly FactImport[]): Map<string, FactImport[]> {
  return groupBy(
    imports.filter(
      ({ reexport, role, conditional, reference }) =>
        !reexport && !conditional && !reference && role !== 'test',
    ),
    ({ from }) => from,
  );
}

export function exportedNameCollisionFindings(
  modules: readonly CopyModule[],
  imports: readonly FactImport[],
  context: CollisionContext,
): Finding[] {
  const index = moduleIndex(modules, imports);
  const importsByFile = importsByImporter(imports);
  const environment: Environment = { ...context, index, importsByFile };
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
      line: definitionOf(index, origin)?.line,
      values: {
        name,
        others: listPaths(others),
        importer,
        fix: context.fixFor?.(importer) ?? COLLISION_FIX,
      },
    }),
  );
}
