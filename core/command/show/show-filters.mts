import path from 'node:path';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';
import type { ShowOptions } from './show-arguments.mts';
import type { LoadedReport } from './show-reports.mts';

type Entry = Readonly<Record<string, unknown>>;

type Filters = ShowOptions & {
  readonly projectRoot: string;
  readonly workingDirectory?: string | undefined;
};

function projectPath(filters: Filters): string | undefined {
  if (filters.path === undefined) {
    return undefined;
  }
  const base = filters.workingDirectory ?? process.cwd();
  const relative = path.relative(filters.projectRoot, path.resolve(base, filters.path));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`--path ${filters.path} is outside the project ${filters.projectRoot}`);
  }
  return relative === '' ? '.' : relative.split(path.sep).join('/');
}

function inPath(finding: Entry, wanted: string | undefined): boolean {
  if (wanted === undefined || wanted === '.') {
    return true;
  }
  const findingPath = textOf(fieldOf(finding, 'path'));
  return findingPath === wanted || findingPath.startsWith(`${wanted}/`);
}

function ruleMatches(finding: Entry, ruleFilters: readonly string[]): boolean {
  const label = `${textOf(fieldOf(finding, 'tool'))}/${textOf(fieldOf(finding, 'rule'))}`;
  return ruleFilters.length === 0 || ruleFilters.some((filter) => label.includes(filter));
}

export function filtersLine({ ruleFilters, path: given }: ShowOptions): string {
  const parts = [
    ...(ruleFilters.length === 0 ? [] : [`--rule ${ruleFilters.join(', ')}`]),
    ...(given === undefined ? [] : [`--path ${given}`]),
  ];
  return parts.length === 0 ? '' : `Filtered by ${parts.join(' and ')}.\n`;
}

function keeps(finding: Entry, filters: Filters, wanted: string | undefined): boolean {
  return ruleMatches(finding, filters.ruleFilters) && inPath(finding, wanted);
}

export function filterReport(report: LoadedReport, filters: Filters): LoadedReport {
  const wanted = projectPath(filters);
  if (wanted === undefined && filters.ruleFilters.length === 0) {
    return report;
  }
  return {
    ...report,
    findings: report.findings.filter((finding) => keeps(finding, filters, wanted)),
    held: report.held.filter((finding) => keeps(finding, filters, wanted)),
  };
}

export function matchesAny(report: LoadedReport): boolean {
  return report.findings.length + report.held.length + report.toolErrors.length > 0;
}
