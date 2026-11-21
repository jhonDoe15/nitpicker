import path from 'node:path';
import { CHANGE_HISTORY_TOOL, HISTORY_RULE_IDS } from '../../../project-rules/hygiene-rules.mts';
import { folderModuleResolver } from '../evidence/production-files.mts';
import { CO_CHANGE_ADVICE } from '../findings.mts';
import { MODULE_IMPORTS, moduleImportsOf, type ModuleImport } from './module-imports.mts';
import type { PathFinding } from '../../../hygiene/check-types.mts';
import type { HistoryPolicy } from '../../typed/history-types.mts';

type Report = { readonly findings: readonly PathFinding[]; readonly [field: string]: unknown };
type RunWithReports = { readonly reports: ReadonlyMap<string, Report> };
type Links = {
  readonly edges: ReadonlyMap<string, number>;
  readonly unresolved: readonly { readonly importer: string; readonly packageFolder: string }[];
};

const UNAVAILABLE = 'Imports between them are unknown: no analyzer reported any for this run.';
const UNKNOWN = 'Whether they import each other is unknown:';
const UNRELATED = 'Neither imports the other, so what they share is not visible as a dependency.';

function filesText(count: number): string {
  return count === 1 ? '1 file' : `${String(count)} files`;
}

function publishedImports(reports: ReadonlyMap<string, Report>): ModuleImport[] | undefined {
  const published = [...reports.values()].flatMap((report) => {
    const imports = moduleImportsOf(report[MODULE_IMPORTS]);
    return imports === undefined ? [] : [imports];
  });
  return published.length === 0 ? undefined : published.flat();
}

function isWithin(folder: string, packageFolder: string): boolean {
  return (
    packageFolder === '.' || folder === packageFolder || folder.startsWith(`${packageFolder}/`)
  );
}

function moduleLinks(imports: readonly ModuleImport[], policy: HistoryPolicy): Links {
  const moduleOf = folderModuleResolver(policy);
  const importers = new Map<string, Set<string>>();
  const unresolved: { importer: string; packageFolder: string }[] = [];
  for (const { from, to, package: packageFolder } of imports) {
    const folder = path.posix.dirname(from);
    const source = folder === '.' ? undefined : moduleOf(folder);
    if (source !== undefined && packageFolder !== undefined) {
      unresolved.push({ importer: source, packageFolder });
    }
    const target = to === undefined ? undefined : moduleOf(to);
    if (source !== undefined && target !== undefined && source !== target) {
      const key = JSON.stringify([source, target]);
      importers.set(key, (importers.get(key) ?? new Set()).add(from));
    }
  }
  const edges = new Map([...importers].map(([key, files]) => [key, files.size]));
  return { edges, unresolved };
}

function importClause(
  edges: ReadonlyMap<string, number>,
  importer: string,
  imported: string,
): string | undefined {
  const count = edges.get(JSON.stringify([importer, imported]));
  return count === undefined ? undefined : `${importer} imports ${imported} in ${filesText(count)}`;
}

function unresolvedClause(
  unresolved: Links['unresolved'],
  importer: string,
  imported: string,
): string | undefined {
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

function dependencySentence(links: Links | undefined, [first, second]: [string, string]): string {
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

function isCoChange(finding: PathFinding): boolean {
  return finding.tool === CHANGE_HISTORY_TOOL && finding.rule === HISTORY_RULE_IDS.coChange;
}

function withDependency(finding: PathFinding, links: Links | undefined): PathFinding {
  const modules = finding.identity.split('|');
  const [first, second] = modules;
  if (
    !isCoChange(finding) ||
    modules.length !== 2 ||
    first === undefined ||
    second === undefined ||
    !finding.message.includes(CO_CHANGE_ADVICE)
  ) {
    return finding;
  }
  const sentence = dependencySentence(links, [first, second]);
  return {
    ...finding,
    message: finding.message.replace(CO_CHANGE_ADVICE, () => `${sentence} ${CO_CHANGE_ADVICE}`),
  };
}

function withoutImports(report: Report): Record<string, unknown> {
  return Object.fromEntries(Object.entries(report).filter(([key]) => key !== MODULE_IMPORTS));
}

export function withCoChangeDependencies<Run extends RunWithReports>(
  run: Run,
  policy: HistoryPolicy = {},
): Run & { readonly reports: Map<string, Report> } {
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
