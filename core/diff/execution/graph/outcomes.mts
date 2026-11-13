import { fieldOf } from '../../../../shared/values/readers.mts';
import type { AnalyzerTask } from '../tasks.mts';

export type Outcome = {
  readonly name: string;
  readonly report?: unknown;
  readonly error?: string;
  readonly skippedBecause?: string;
  readonly missing?: true;
  readonly elapsedMs?: number;
};

export type ProgressEvent = {
  readonly name: string;
  readonly status: 'skipped' | 'failed' | 'done';
  readonly elapsedMs: number | undefined;
  readonly because?: string;
};

export type GraphResult = {
  readonly reports: readonly (readonly [string, unknown])[];
  readonly errors: readonly { readonly name: string; readonly message: string }[];
  readonly timings: readonly { readonly name: string; readonly elapsedMs: number | undefined }[];
  readonly skipped?: readonly { readonly name: string; readonly because: string }[];
};

function findingsOf(outcome: Outcome): readonly unknown[] {
  const findings = fieldOf(outcome.report, 'findings');
  return Array.isArray(findings) ? findings : [];
}

export function summarizeOutcomes(outcomes: readonly Outcome[]): GraphResult {
  const skipped = outcomes.flatMap(({ name, skippedBecause }) =>
    skippedBecause === undefined ? [] : [{ name, because: skippedBecause }],
  );
  return {
    reports: outcomes
      .filter((outcome) => outcome.report !== undefined)
      .map((outcome): readonly [string, unknown] => [outcome.name, outcome.report]),
    errors: outcomes.flatMap(({ name, error }) =>
      error === undefined ? [] : [{ name, message: error }],
    ),
    timings: outcomes.map(({ name, elapsedMs }) => ({ name, elapsedMs })),
    ...(skipped.length === 0 ? {} : { skipped }),
  };
}

export function progressEvent(outcome: Outcome): ProgressEvent {
  const { name, elapsedMs } = outcome;
  if (outcome.skippedBecause !== undefined) {
    return { name, status: 'skipped', elapsedMs, because: outcome.skippedBecause };
  }
  return { name, status: hasFailed(outcome) ? 'failed' : 'done', elapsedMs };
}

function hasFailed(outcome: Outcome): boolean {
  return (
    outcome.error !== undefined ||
    outcome.skippedBecause !== undefined ||
    findingsOf(outcome).some((finding) => fieldOf(finding, 'classification') === 'tool-error')
  );
}

export function blockingDependency(
  task: AnalyzerTask,
  dependencyOutcomes: readonly Outcome[],
): Outcome | undefined {
  const tolerated = new Set(task.toleratedDependencyErrors ?? []);
  return dependencyOutcomes.find((outcome) => blocksDependents(outcome, tolerated));
}

function blocksDependents(outcome: Outcome, tolerated: ReadonlySet<unknown>): boolean {
  return (
    outcome.error !== undefined ||
    outcome.skippedBecause !== undefined ||
    findingsOf(outcome).some(
      (finding) =>
        fieldOf(finding, 'classification') === 'tool-error' &&
        !tolerated.has(fieldOf(finding, 'tool')),
    )
  );
}

export function skippedOutcome(taskName: string, failedDependency: Outcome): Outcome {
  if (failedDependency.missing === true) {
    return {
      name: taskName,
      ...(failedDependency.error === undefined ? {} : { error: failedDependency.error }),
      elapsedMs: 0,
    };
  }
  return {
    name: taskName,
    skippedBecause: failedDependency.skippedBecause ?? failedDependency.name,
    elapsedMs: 0,
  };
}

export function cancelledOutcome(taskName: string): Outcome {
  return {
    name: taskName,
    error: `Analyzer scheduler cancelled before ${taskName} started`,
    elapsedMs: 0,
  };
}
