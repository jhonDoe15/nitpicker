import { groupBy, reexportSteps } from '../facts/fact-graph.mjs';
import { packageLookup, roleLookup } from '../facts/reuse-modules.mjs';
import { NEUTRAL_TEST_ONLY_MESSAGES, testOnlyFindings } from './test-only-judgement.mjs';

const TYPE_KINDS = new Set(['type', 'interface']);

function addRole(map, key, role) {
  const roles = map.get(key) ?? new Set();
  roles.add(role);
  map.set(key, roles);
}

function moduleExports(definitions) {
  const byFile = new Map();
  for (const { file, name, exported, exportNames = exported ? [name] : [] } of definitions) {
    const names = byFile.get(file) ?? new Map();
    for (const exportName of exportNames) names.set(exportName, name);
    byFile.set(file, names);
  }
  return byFile;
}

function recordStep(graph, step, role) {
  addRole(graph.loaded, step.file, role);
  const local = graph.exports.get(step.file)?.get(step.name);
  if (step.name === '*') {
    addRole(graph.starred, step.file, role);
  }
  if (local !== undefined) {
    addRole(graph.named, `${step.file}\0${local}`, role);
    return [];
  }
  return reexportSteps(graph.reexports.get(step.file) ?? [], step.name);
}

function recordUses(graph, start, role) {
  const seen = new Set();
  const pending = [start];
  for (const step of pending) {
    const visit = `${step.file}\0${step.name}`;
    if (!seen.has(visit)) {
      seen.add(visit);
      pending.push(...recordStep(graph, step, role));
    }
  }
}

function usesOf({ definitions, imports }) {
  const graph = {
    exports: moduleExports(definitions),
    reexports: groupBy(
      imports.filter(({ reexport }) => reexport),
      ({ from }) => from,
    ),
    loaded: new Map(),
    starred: new Map(),
    named: new Map(),
  };
  for (const record of imports.filter(({ reexport }) => !reexport)) {
    addRole(graph.loaded, record.to, record.role);
    for (const { name } of record.names) {
      recordUses(graph, { file: record.to, name }, record.role);
    }
  }
  return graph;
}

function isTestOnly(roles) {
  return roles !== undefined && roles.has('test') && !roles.has('production');
}

function definitionCandidates(file, definitions, graph) {
  const starred = graph.starred.get(file) ?? new Set();
  return definitions
    .filter(({ exported, exportNames }) => exported || (exportNames ?? []).length > 0)
    .filter(({ name }) =>
      isTestOnly(new Set([...(graph.named.get(`${file}\0${name}`) ?? []), ...starred])),
    )
    .map(({ name, kind, line, exportNames }) => ({
      file,
      category: TYPE_KINDS.has(kind) ? 'types' : 'exports',
      entry: { name: exportNames?.[0] ?? name, line },
    }));
}

function testOnlyCandidates({ modules, definitions, imports }) {
  const graph = usesOf({ definitions, imports });
  const byFile = groupBy(definitions, ({ file }) => file);
  const production = modules.filter(({ role }) => role !== 'test');
  return production.flatMap(({ file, entry }) => {
    if (entry !== true && isTestOnly(graph.loaded.get(file))) {
      return [{ file, category: 'files', entry: { name: file } }];
    }
    return definitionCandidates(file, byFile.get(file) ?? [], graph);
  });
}

export function testOnlyFactFindings(facts, { analyzerName, isExcepted }) {
  const packageOf = packageLookup(facts.packages);
  const roleOf = roleLookup(facts.modules);
  const definitions = facts.definitions.filter(({ file }) => roleOf(file) !== 'test');
  return testOnlyFindings(testOnlyCandidates({ ...facts, definitions }), {
    analyzerName,
    isExcepted,
    isPublished: (file) => packageOf(file)?.published === true,
    messages: NEUTRAL_TEST_ONLY_MESSAGES,
  });
}
