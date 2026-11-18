import { existsSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chainOf as untypedChainOf } from '../../../shared/traversal.mjs';
import { renderJunitReport } from '../../diff/reporting/junit.mts';
import { renderSarifReport } from '../../diff/reporting/sarif.mts';
import { reportFolder as untypedReportFolder } from '../plan/project-entry.mts';
import { SUMMARY_FILE } from './combined-summary.mts';
import type { ReportData } from '../../../shared/values/findings.mts';
import type { MonorepoPlan, PlanProject, RepositoryPolicy } from '../project-types.mts';

type SarifRun = Readonly<Record<string, unknown>>;
type CombinedContext = {
  readonly outputRoot: string;
  readonly plan: MonorepoPlan;
  readonly repository: RepositoryPolicy | undefined;
};
type Render = (context: CombinedContext, file: string) => string | undefined;
type StaleReports = {
  readonly outputRoot: string;
  readonly plan: MonorepoPlan;
  readonly clearReports: (folder: string) => void;
};

const chainOf: <T>(start: T, next: (current: T) => T | undefined) => T[] = untypedChainOf;

const SARIF_FILES = ['report.sarif', 'report-baseline.sarif'];
const JUNIT_FILE = 'report.junit.xml';
const TESTSUITE = /<testsuite\b[\s\S]*?<\/testsuite>/u;
const FINDING_CASE = /(classname="quality\.diff\.new-findings" name="[^" ]+ )/gu;
const REPOSITORY_CATEGORY = 'nitpicker-repository/';
const REPOSITORY_SUITE = '(repository policy)';

function insideOutput(outputRoot: string, folder: string): string | undefined {
  const full = path.resolve(outputRoot, folder);
  if (!full.startsWith(outputRoot + path.sep)) {
    return undefined;
  }
  return full;
}

function readInside(outputRoot: string, ...segments: readonly string[]): string | undefined {
  const full = path.resolve(outputRoot, ...segments);
  if (!full.startsWith(outputRoot + path.sep)) {
    return undefined;
  }
  return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
}

function relocatedRun(run: SarifRun, category: string): SarifRun {
  return { ...run, automationDetails: { id: category } };
}

function repositoryReport(repository: RepositoryPolicy | undefined): ReportData {
  return {
    summary: { tools: [], elapsedMs: 0 },
    newFindings: repository?.findings ?? [],
    resolvedFindings: [],
    unchangedFindings: [],
    changedMetrics: [],
    toolErrors: repository?.toolErrors ?? [],
  };
}

const reportFolder: (projectPath: string) => string = untypedReportFolder;
const parseSarif: (text: string) => { readonly runs: SarifRun[] } = JSON.parse;
const parseLog: (text: string) => object = JSON.parse;

function runsOf(text: string): SarifRun[] {
  return parseSarif(text).runs;
}

function projectRuns(
  outputRoot: string,
  projects: readonly PlanProject[],
  file: string,
): SarifRun[] {
  return projects.flatMap((project) => {
    const text = readInside(outputRoot, reportFolder(project.path), file);
    return text === undefined
      ? []
      : runsOf(text).map((run) => relocatedRun(run, `nitpicker/${project.path}/`));
  });
}

function combinedSarif(
  { outputRoot, plan, repository }: CombinedContext,
  file: string,
): string | undefined {
  const runs = projectRuns(outputRoot, plan.projects, file);
  const options = { projectPath: plan.prefix };
  const policy =
    repository === undefined
      ? []
      : runsOf(renderSarifReport(repositoryReport(repository), options));
  if (runs.length === 0 && policy.length === 0) {
    return undefined;
  }
  const log = parseLog(renderSarifReport(repositoryReport(undefined), options));
  const repositoryRuns = policy.map((run) => relocatedRun(run, REPOSITORY_CATEGORY));
  return `${JSON.stringify({ ...log, runs: [...runs, ...repositoryRuns] }, null, 2)}\n`;
}

function escapedXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function renamedSuite(text: string, label: string): string | undefined {
  return TESTSUITE.exec(text)?.[0].replace(
    / name="([^"]*)"/u,
    (_match, name: string) => ` name="${name} ${escapedXml(label)}"`,
  );
}

function fromRepositoryRoot(suite: string, repoPath: string): string {
  return repoPath === '.'
    ? suite
    : suite.replaceAll(FINDING_CASE, (start) => `${start}${escapedXml(repoPath)}/`);
}

function projectSuites(outputRoot: string, projects: readonly PlanProject[]): string[] {
  return projects.flatMap((project) => {
    const text = readInside(outputRoot, reportFolder(project.path), JUNIT_FILE);
    const suite = text === undefined ? undefined : renamedSuite(text, project.path);
    return suite === undefined ? [] : [fromRepositoryRoot(suite, project.repoPath)];
  });
}

function combinedJunit({ outputRoot, plan, repository }: CombinedContext): string | undefined {
  const suites = projectSuites(outputRoot, plan.projects);
  const policySuite =
    repository === undefined
      ? undefined
      : renamedSuite(renderJunitReport(repositoryReport(repository)), REPOSITORY_SUITE);
  const policy = policySuite === undefined ? [] : [fromRepositoryRoot(policySuite, plan.prefix)];
  if (suites.length === 0 && policy.length === 0) {
    return undefined;
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites>',
    ...suites,
    ...policy,
    '</testsuites>',
    '',
  ].join('\n');
}

export function writeCombinedMachineReports(context: CombinedContext): void {
  const renders: readonly (readonly [string, Render])[] = [
    ...SARIF_FILES.map((file): readonly [string, Render] => [file, combinedSarif]),
    [JUNIT_FILE, combinedJunit],
  ];
  for (const [file, render] of renders) {
    const text = render(context, file);
    if (text !== undefined) {
      writeFileSync(path.join(context.outputRoot, file), text);
    }
  }
}

function parsedSummary(text: string): { readonly value: unknown; readonly unreadable?: true } {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { value: undefined, unreadable: true };
  }
}

function reportOf(project: unknown): string[] {
  return typeof project === 'object' &&
    project !== null &&
    'report' in project &&
    typeof project.report === 'string'
    ? [project.report]
    : [];
}

function previousFolders(outputRoot: string): string[] {
  const text = readInside(outputRoot, SUMMARY_FILE);
  if (text === undefined) {
    return [];
  }
  const { value } = parsedSummary(text);
  const projects: unknown =
    typeof value === 'object' && value !== null && 'projects' in value ? value.projects : undefined;
  return Array.isArray(projects) ? projects.flatMap((project: unknown) => reportOf(project)) : [];
}

function parentOf(folder: string): string | undefined {
  const parent = path.posix.dirname(folder);
  return parent === '.' ? undefined : parent;
}

function removeEmptyFolders(outputRoot: string, folder: string): void {
  for (const current of chainOf(folder, parentOf)) {
    const full = insideOutput(outputRoot, current);
    if (full === undefined || !existsSync(full) || readdirSync(full).length > 0) {
      return;
    }
    rmdirSync(full);
  }
}

export function clearStaleProjectReports({ outputRoot, plan, clearReports }: StaleReports): void {
  const current = new Set(plan.projects.map((project) => reportFolder(project.path)));
  for (const folder of previousFolders(outputRoot).filter((entry) => !current.has(entry))) {
    const full = insideOutput(outputRoot, folder);
    if (full !== undefined) {
      clearReports(full);
      removeEmptyFolders(outputRoot, folder);
    }
  }
}
