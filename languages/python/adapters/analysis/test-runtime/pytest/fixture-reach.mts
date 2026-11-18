import path from 'node:path';
import { CONFTEST } from './constants.mts';
import type { FixtureReach, Literals } from '../typed/runtime-types.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

type FixtureTable = Map<string, { autouse: boolean; requests: Set<string> }>;
type Provider = { file: string; table: FixtureTable };
type Scope = {
  conftests: Map<string, string>;
  literals: Literals;
  fileOfModule: ReadonlyMap<string, string>;
  importedFiles: ReadonlyMap<string, readonly string[]>;
  isHelper: (file: string) => boolean;
  tables: Map<string, FixtureTable>;
};
type ScopeInput = Omit<Scope, 'conftests' | 'tables'> & { files: readonly string[] };
type FixtureRequest = { name: string; from: number };

const NO_FIXTURES: Literals[string]['fixtures'] = [];

export function ancestorDirectories(file: string): string[] {
  const parts = path.posix.dirname(file).split('/');
  return parts[0] === '.'
    ? ['.']
    : [...parts.map((_, index) => parts.slice(0, parts.length - index).join('/')), '.'];
}

function fixtureTable(fixtures: Literals[string]['fixtures']): FixtureTable {
  const table: FixtureTable = new Map();
  for (const { name, autouse, requests } of fixtures) {
    const known = table.get(name) ?? { autouse: false, requests: new Set() };
    known.autouse ||= autouse;
    for (const request of requests) {
      known.requests.add(request);
    }
    table.set(name, known);
  }
  return table;
}

function tableOf(scope: Scope, file: string): FixtureTable {
  const cached = scope.tables.get(file);
  if (cached !== undefined) {
    return cached;
  }
  const table = fixtureTable(scope.literals[file]?.fixtures ?? NO_FIXTURES);
  scope.tables.set(file, table);
  return table;
}

function pluginFiles(scope: Scope, file: string): string[] {
  const found = new Set<string>();
  const pending = [file];
  for (const current of pending) {
    const plugins = (scope.literals[current]?.plugins ?? [])
      .map((name) => scope.fileOfModule.get(name))
      .filter((plugin) => plugin !== undefined)
      .filter((plugin) => !found.has(plugin));
    for (const plugin of plugins) {
      found.add(plugin);
      pending.push(plugin);
    }
  }
  return [...found];
}

function ownAndImported(scope: Scope, file: string): string[] {
  const imported = (scope.importedFiles.get(file) ?? []).filter(
    (candidate) => tableOf(scope, candidate).size > 0,
  );
  return [file, ...imported];
}

function providersOf(scope: Scope, test: string): Provider[] {
  const conftests = ancestorDirectories(test)
    .filter((directory) => scope.conftests.has(directory))
    .flatMap((directory) => scope.conftests.get(directory) ?? []);
  const files = new Set([
    ...ownAndImported(scope, test),
    ...pluginFiles(scope, test),
    ...conftests.flatMap((file) => [...ownAndImported(scope, file), ...pluginFiles(scope, file)]),
  ]);
  return [...files].map((file) => ({ file, table: tableOf(scope, file) }));
}

function requestsOf(scope: Scope, test: string): Set<string> {
  const found = new Set<string>();
  const pending = [test];
  const visited = new Set(pending);
  for (const current of pending) {
    for (const request of scope.literals[current]?.requests ?? []) {
      found.add(request);
    }
    const helpers = (scope.importedFiles.get(current) ?? []).filter(
      (file) => scope.isHelper(file) && !visited.has(file),
    );
    for (const file of helpers) {
      visited.add(file);
      pending.push(file);
    }
  }
  return found;
}

function autouseNames(providers: readonly Provider[]): string[] {
  return providers.flatMap(({ table }) =>
    [...table].filter(([, { autouse }]) => autouse).map(([name]) => name),
  );
}

function providerIndex(providers: readonly Provider[], { name, from }: FixtureRequest): number {
  return providers.findIndex(({ table }, position) => position >= from && table.has(name));
}

function followUps(providers: readonly Provider[], index: number, name: string): FixtureRequest[] {
  return [...(providers[index]?.table.get(name)?.requests ?? [])].map((next) => ({
    name: next,
    from: next === name ? index + 1 : 0,
  }));
}

function resolveFixtures(
  providers: readonly Provider[],
  names: readonly string[],
): { reached: Set<string>; unresolved: Set<string> } {
  const reached = new Set<string>();
  const unresolved = new Set<string>();
  const seen = new Set<string>();
  const pending: FixtureRequest[] = names.map((name) => ({ name, from: 0 }));
  for (const request of pending) {
    const index = providerIndex(providers, request);
    const provider = providers[index];
    const key = `${String(index)}\0${request.name}`;
    if (provider === undefined) {
      unresolved.add(request.name);
    } else if (!seen.has(key)) {
      seen.add(key);
      reached.add(provider.file);
      appendAll(pending, followUps(providers, index, request.name));
    }
  }
  return { reached, unresolved };
}

function fixturesReached(scope: Scope, test: string): FixtureReach {
  const providers = providersOf(scope, test);
  const names = [...requestsOf(scope, test), ...autouseNames(providers)];
  const { reached, unresolved } = resolveFixtures(providers, names);
  reached.delete(test);
  return { files: [...reached].sort(), unresolved, marks: new Set(scope.literals[test]?.marks) };
}

export function createFixtureScope({
  files,
  literals,
  fileOfModule,
  importedFiles,
  isHelper,
}: ScopeInput): (test: string) => FixtureReach {
  const conftests = new Map(
    files
      .filter((file) => path.posix.basename(file) === CONFTEST)
      .map((file) => [path.posix.dirname(file), file]),
  );
  const scope: Scope = {
    conftests,
    literals,
    fileOfModule,
    importedFiles,
    isHelper,
    tables: new Map(),
  };
  return function reach(test: string): FixtureReach {
    return fixturesReached(scope, test);
  };
}
