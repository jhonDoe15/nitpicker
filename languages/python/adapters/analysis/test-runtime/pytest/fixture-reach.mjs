import path from 'node:path';
import { CONFTEST } from './constants.mjs';

const NO_FIXTURES = [];

export function ancestorDirectories(file) {
  const parts = path.posix.dirname(file).split('/');
  return parts[0] === '.'
    ? ['.']
    : [...parts.map((_, index) => parts.slice(0, parts.length - index).join('/')), '.'];
}

function fixtureTable(fixtures) {
  const table = new Map();
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

function tableOf(scope, file) {
  if (!scope.tables.has(file)) {
    scope.tables.set(file, fixtureTable(scope.literals[file]?.fixtures ?? NO_FIXTURES));
  }
  return scope.tables.get(file);
}

function pluginFiles(scope, file) {
  const found = new Set();
  const pending = [file];
  for (const current of pending) {
    const plugins = (scope.literals[current]?.plugins ?? [])
      .map((name) => scope.fileOfModule.get(name))
      .filter((plugin) => plugin !== undefined && !found.has(plugin));
    for (const plugin of plugins) {
      found.add(plugin);
      pending.push(plugin);
    }
  }
  return [...found];
}

function ownAndImported(scope, file) {
  const imported = (scope.importedFiles.get(file) ?? []).filter(
    (candidate) => tableOf(scope, candidate).size > 0,
  );
  return [file, ...imported];
}

function providersOf(scope, test) {
  const conftests = ancestorDirectories(test)
    .filter((directory) => scope.conftests.has(directory))
    .map((directory) => scope.conftests.get(directory));
  const files = new Set([
    ...ownAndImported(scope, test),
    ...pluginFiles(scope, test),
    ...conftests.flatMap((file) => [...ownAndImported(scope, file), ...pluginFiles(scope, file)]),
  ]);
  return [...files].map((file) => ({ file, table: tableOf(scope, file) }));
}

function requestsOf(scope, test) {
  const found = new Set();
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

function autouseNames(providers) {
  return providers.flatMap(({ table }) =>
    [...table].filter(([, { autouse }]) => autouse).map(([name]) => name),
  );
}

function providerIndex(providers, { name, from }) {
  return providers.findIndex(({ table }, position) => position >= from && table.has(name));
}

function followUps(providers, index, name) {
  return [...providers[index].table.get(name).requests].map((next) => ({
    name: next,
    from: next === name ? index + 1 : 0,
  }));
}

function resolveFixtures(providers, names) {
  const reached = new Set();
  const unresolved = new Set();
  const seen = new Set();
  const pending = names.map((name) => ({ name, from: 0 }));
  for (const request of pending) {
    const index = providerIndex(providers, request);
    const key = `${index}\0${request.name}`;
    if (index < 0) {
      unresolved.add(request.name);
    } else if (!seen.has(key)) {
      seen.add(key);
      reached.add(providers[index].file);
      pending.push(...followUps(providers, index, request.name));
    }
  }
  return { reached, unresolved };
}

function fixturesReached(scope, test) {
  const providers = providersOf(scope, test);
  const names = [...requestsOf(scope, test), ...autouseNames(providers)];
  const { reached, unresolved } = resolveFixtures(providers, names);
  reached.delete(test);
  return { files: [...reached].sort(), unresolved, marks: new Set(scope.literals[test]?.marks) };
}

export function createFixtureScope({ files, literals, fileOfModule, importedFiles, isHelper }) {
  const conftests = new Map(
    files
      .filter((file) => path.posix.basename(file) === CONFTEST)
      .map((file) => [path.posix.dirname(file), file]),
  );
  const scope = { conftests, literals, fileOfModule, importedFiles, isHelper, tables: new Map() };
  return function reach(test) {
    return fixturesReached(scope, test);
  };
}
