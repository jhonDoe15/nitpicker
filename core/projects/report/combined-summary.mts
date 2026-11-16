import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { reportFolder } from '../plan/project-entry.mts';
import type { CliOptions } from '../../cli-context.mts';
import type {
  MonorepoPlan,
  ProjectOutcome,
  ProjectRow,
  RepositoryPolicy,
} from '../project-types.mts';

type RanFields = {
  readonly overallStatus: string;
  readonly exitCode: number;
  readonly newEnforceableFindings: number;
  readonly toolErrors: number;
  readonly report: string;
  readonly summary: string;
};

type SummaryEntry = Partial<RanFields> & {
  readonly path: string;
  readonly preset: string;
  readonly status: string;
  readonly reason?: string | undefined;
  readonly policyDigest?: string;
  readonly error?: string;
};

type RepositorySummary = Omit<RepositoryPolicy, 'findings'> & {
  readonly newEnforceableFindings: number;
};

export type CombinedSummary = {
  readonly source: MonorepoPlan['source'];
  readonly overallStatus: string;
  readonly newEnforceableFindings: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly projects: readonly SummaryEntry[];
  readonly repositoryPolicy?: RepositorySummary;
  readonly outsideProjects: unknown;
  readonly notices: readonly string[];
  readonly elapsedMs: number;
};

type SummaryInput = {
  readonly plan: MonorepoPlan;
  readonly results: readonly ProjectRow[];
  readonly outside: unknown;
  readonly notices: readonly string[];
  readonly repository: RepositoryPolicy | undefined;
  readonly elapsedMs: number;
};

const TOOL_ERROR = 'tool-error';
const SKIPPED = 'skipped';

const REPORT_FILE = 'report.txt';
export const SUMMARY_FILE = 'summary.json';

function repositoryFailed(repository: RepositoryPolicy | undefined): boolean {
  return repository !== undefined && !repository.accepted;
}

function repositoryIncomplete(repository: RepositoryPolicy | undefined): boolean {
  return (repository?.toolErrors ?? []).length > 0;
}

export function exitCodeOf(
  summary: Pick<CombinedSummary, 'projects'> & { readonly repositoryPolicy?: RepositoryPolicy },
  { deferExit = false }: Partial<Pick<CliOptions, 'deferExit'>> = {},
): number {
  const { projects, repositoryPolicy } = summary;
  const incomplete = repositoryIncomplete(repositoryPolicy);
  if (deferExit) {
    return incomplete || projects.some(({ overallStatus }) => overallStatus === TOOL_ERROR) ? 2 : 0;
  }
  if (repositoryFailed(repositoryPolicy) || projects.some(({ status }) => status === 'failed')) {
    return 1;
  }
  return incomplete || projects.some(({ status }) => status === 'error') ? 2 : 0;
}

function countOf(results: readonly SummaryEntry[], status: string): number {
  return results.filter((result) => result.status === status).length;
}

function ranFields(outcome: ProjectOutcome, folder: string): RanFields {
  return {
    overallStatus: outcome.complete ? 'completed' : TOOL_ERROR,
    exitCode: outcome.exitCode,
    newEnforceableFindings: outcome.newEnforceableFindings,
    toolErrors: outcome.toolErrors,
    report: folder,
    summary: `${folder}/${SUMMARY_FILE}`,
  };
}

function entryOf(result: ProjectRow): SummaryEntry {
  const { project, selection, outcome } = result;
  return {
    path: project.path,
    preset: project.preset,
    status: outcome === undefined ? SKIPPED : outcome.status,
    reason: selection.reason,
    ...(outcome === undefined ? {} : ranFields(outcome, reportFolder(project.path))),
    ...(outcome?.policyDigest === undefined ? {} : { policyDigest: outcome.policyDigest }),
    ...(outcome?.error === undefined ? {} : { error: outcome.error }),
  };
}

function repositoryFields(repository: RepositoryPolicy | undefined): {
  readonly repositoryPolicy?: RepositorySummary;
} {
  if (repository === undefined) {
    return {};
  }
  const { findings, ...fields } = repository;
  return { repositoryPolicy: { ...fields, newEnforceableFindings: (findings ?? []).length } };
}

export function combinedSummary({
  plan,
  results,
  outside,
  notices,
  repository,
  elapsedMs,
}: SummaryInput): CombinedSummary {
  const projects = results.map(entryOf);
  const incomplete = projects.filter(({ overallStatus }) => overallStatus === TOOL_ERROR);
  const ownFindings = projects.reduce(
    (total, { newEnforceableFindings = 0 }) => total + newEnforceableFindings,
    0,
  );
  return {
    source: plan.source,
    overallStatus:
      incomplete.length > 0 || repositoryIncomplete(repository) ? TOOL_ERROR : 'completed',
    newEnforceableFindings: ownFindings + (repository?.findings?.length ?? 0),
    counts: {
      projects: projects.length,
      run: projects.length - countOf(projects, SKIPPED),
      passed: countOf(projects, 'passed'),
      failed: countOf(projects, 'failed'),
      errored: countOf(projects, 'error'),
      incomplete: incomplete.length,
      skipped: countOf(projects, SKIPPED),
    },
    projects,
    ...repositoryFields(repository),
    outsideProjects: outside,
    notices,
    elapsedMs,
  };
}

export function writeCombinedReports(
  outputRoot: string,
  summary: CombinedSummary,
  text: string,
): void {
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(path.join(outputRoot, SUMMARY_FILE), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(path.join(outputRoot, REPORT_FILE), text);
}
