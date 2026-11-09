import { CHANGE_HISTORY_TOOL, HISTORY_RULE_IDS } from '../../../project-rules/hygiene-rules.mjs';
import { folderModuleResolver } from '../evidence/production-files.mjs';
import { CO_CHANGE_ADVICE } from '../findings.mjs';
import { MODULE_IMPORTS } from './module-imports.mjs';

const UNAVAILABLE = 'Imports between them are unknown: no analyzer reported any for this run.';
const UNRELATED = 'Neither imports the other, so what they share is not visible as a dependency.';

function filesText(count) {
  return count === 1 ? '1 file' : `${String(count)} files`;
}

function publishedImports(reports) {
  const published = [...reports.values()].filter((report) => Array.isArray(report[MODULE_IMPORTS]));
  return published.length === 0 ? undefined : published.flatMap((report) => report[MODULE_IMPORTS]);
}

function moduleEdges(imports, policy) {
  const moduleOf = folderModuleResolver(policy);
  const edges = new Map();
  for (const { from, to, files } of imports) {
    const source = moduleOf(from);
    const target = moduleOf(to);
    if (source !== undefined && target !== undefined && source !== target) {
      const key = `${source}\0${target}`;
      edges.set(key, (edges.get(key) ?? 0) + files);
    }
  }
  return edges;
}

function importClause(edges, importer, imported) {
  const count = edges.get(`${importer}\0${imported}`);
  return count === undefined ? undefined : `${importer} imports ${imported} in ${filesText(count)}`;
}

function dependencySentence(edges, [first, second]) {
  if (edges === undefined) {
    return UNAVAILABLE;
  }
  const clauses = [importClause(edges, first, second), importClause(edges, second, first)].filter(
    (clause) => clause !== undefined,
  );
  return clauses.length === 0 ? UNRELATED : `${clauses.join(' and ')}.`;
}

function isCoChange(finding) {
  return finding.tool === CHANGE_HISTORY_TOOL && finding.rule === HISTORY_RULE_IDS.coChange;
}

function withDependency(finding, edges) {
  const modules = finding.identity.split('|');
  if (!isCoChange(finding) || modules.length !== 2 || !finding.message.includes(CO_CHANGE_ADVICE)) {
    return finding;
  }
  const sentence = dependencySentence(edges, modules);
  return {
    ...finding,
    message: finding.message.replace(CO_CHANGE_ADVICE, `${sentence} ${CO_CHANGE_ADVICE}`),
  };
}

function withoutImports(report) {
  return Object.fromEntries(Object.entries(report).filter(([key]) => key !== MODULE_IMPORTS));
}

export function withCoChangeDependencies(run, policy = {}) {
  const imports = publishedImports(run.reports);
  const edges = imports === undefined ? undefined : moduleEdges(imports, policy);
  const reports = new Map(
    [...run.reports].map(([name, report]) => [
      name,
      {
        ...withoutImports(report),
        findings: report.findings.map((finding) => withDependency(finding, edges)),
      },
    ]),
  );
  return { ...run, reports };
}
