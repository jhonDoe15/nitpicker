import path from 'node:path';
import { CHANGE_HISTORY_TOOL, HISTORY_RULE_IDS } from '../../../project-rules/hygiene-rules.mjs';
import { folderModuleResolver } from '../evidence/production-files.mjs';
import { CO_CHANGE_ADVICE } from '../findings.mjs';
import { MODULE_IMPORTS } from './module-imports.mjs';

const UNAVAILABLE = 'Imports between them are unknown: no analyzer reported any for this run.';
const UNKNOWN = 'Whether they import each other is unknown:';
const UNRELATED = 'Neither imports the other, so what they share is not visible as a dependency.';

function filesText(count) {
  return count === 1 ? '1 file' : `${String(count)} files`;
}

function publishedImports(reports) {
  const published = [...reports.values()].filter((report) => Array.isArray(report[MODULE_IMPORTS]));
  return published.length === 0 ? undefined : published.flatMap((report) => report[MODULE_IMPORTS]);
}

function isWithin(folder, packageFolder) {
  return (
    packageFolder === '.' || folder === packageFolder || folder.startsWith(`${packageFolder}/`)
  );
}

function moduleLinks(imports, policy) {
  const moduleOf = folderModuleResolver(policy);
  const importers = new Map();
  const unresolved = [];
  for (const { from, to, package: packageFolder } of imports) {
    const folder = path.posix.dirname(from);
    const source = folder === '.' ? undefined : moduleOf(folder);
    if (source !== undefined && packageFolder !== undefined) {
      unresolved.push({ importer: source, packageFolder });
    }
    const target = to === undefined ? undefined : moduleOf(to);
    if (source !== undefined && target !== undefined && source !== target) {
      const key = `${source}\0${target}`;
      importers.set(key, (importers.get(key) ?? new Set()).add(from));
    }
  }
  const edges = new Map([...importers].map(([key, files]) => [key, files.size]));
  return { edges, unresolved };
}

function importClause(edges, importer, imported) {
  const count = edges.get(`${importer}\0${imported}`);
  return count === undefined ? undefined : `${importer} imports ${imported} in ${filesText(count)}`;
}

function unresolvedClause(unresolved, importer, imported) {
  const reach = unresolved.find(
    ({ importer: source, packageFolder }) =>
      source === importer &&
      isWithin(imported, packageFolder) &&
      !isWithin(importer, packageFolder),
  );
  if (reach === undefined) {
    return undefined;
  }
  const named = `${importer} imports the package in ${reach.packageFolder} by name`;
  return `${UNKNOWN} ${named}, and that import does not lead to its source files.`;
}

function dependencySentence(links, [first, second]) {
  if (links === undefined) {
    return UNAVAILABLE;
  }
  const { edges, unresolved } = links;
  const clauses = [importClause(edges, first, second), importClause(edges, second, first)].filter(
    (clause) => clause !== undefined,
  );
  if (clauses.length > 0) {
    return `${clauses.join(' and ')}.`;
  }
  return (
    unresolvedClause(unresolved, first, second) ??
    unresolvedClause(unresolved, second, first) ??
    UNRELATED
  );
}

function isCoChange(finding) {
  return finding.tool === CHANGE_HISTORY_TOOL && finding.rule === HISTORY_RULE_IDS.coChange;
}

function withDependency(finding, links) {
  const modules = finding.identity.split('|');
  if (!isCoChange(finding) || modules.length !== 2 || !finding.message.includes(CO_CHANGE_ADVICE)) {
    return finding;
  }
  const sentence = dependencySentence(links, modules);
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
  const links = imports === undefined ? undefined : moduleLinks(imports, policy);
  const reports = new Map(
    [...run.reports].map(([name, report]) => [
      name,
      {
        ...withoutImports(report),
        findings: report.findings.map((finding) => withDependency(finding, links)),
      },
    ]),
  );
  return { ...run, reports };
}
