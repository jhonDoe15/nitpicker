import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../../shared/values/readers.mts';

export type SplitReport = {
  readonly own: unknown;
  readonly carried: ReadonlyMap<string, unknown>;
};

export type CarryPlan = {
  readonly scheduled: readonly unknown[];
  readonly carriedBy: ReadonlyMap<unknown, readonly unknown[]>;
};

export type CarriedOutcome = {
  readonly reports: Map<string, unknown>;
  readonly timings: Map<string, number | undefined>;
  readonly toolErrors: ReportEntry[];
  readonly skipped: Map<string, unknown>;
};

function nameOf(analyzer: unknown): string {
  return textOf(fieldOf(analyzer, 'name'));
}

function carries(analyzer: unknown): boolean {
  return fieldOf(analyzer, 'carries') === true;
}

function toolOf(finding: unknown): unknown {
  return fieldOf(finding, 'tool');
}

export function splitByTool(report: unknown, names: readonly string[]): SplitReport {
  const findings = listOf(fieldOf(report, 'findings'));
  return {
    own: {
      ...fieldsOf(report),
      findings: findings.filter((finding) => !names.includes(textOf(toolOf(finding)))),
    },
    carried: new Map(
      names.map((name) => [
        name,
        { findings: findings.filter((finding) => toolOf(finding) === name) },
      ]),
    ),
  };
}

function carrierOf(analyzer: unknown, carriers: ReadonlyMap<string, unknown>): unknown {
  const carrier = fieldOf(analyzer, 'carriedBy');
  return typeof carrier === 'string' ? carriers.get(carrier) : undefined;
}

export function planCarried(analyzers: readonly unknown[]): CarryPlan {
  const carriers = new Map(
    analyzers.filter(carries).map((analyzer) => [nameOf(analyzer), analyzer] as const),
  );
  const carriedBy = Map.groupBy(
    analyzers.filter((analyzer) => carrierOf(analyzer, carriers) !== undefined),
    (analyzer) => carrierOf(analyzer, carriers),
  );
  return {
    scheduled: analyzers.filter((analyzer) => carrierOf(analyzer, carriers) === undefined),
    carriedBy,
  };
}

export function carriedNames(plan: CarryPlan, analyzer: unknown): string[] {
  return (plan.carriedBy.get(analyzer) ?? []).map(nameOf);
}

function carrierFailure(
  outcome: CarriedOutcome,
  carrier: string,
  name: string,
): ReportEntry | undefined {
  const failure = outcome.toolErrors.find(({ tool }) => tool === carrier);
  return failure === undefined
    ? undefined
    : {
        ...failure,
        tool: name,
        message: `${carrier} runs the ${name} rules, and it failed: ${textOf(failure.message)}`,
      };
}

function recordSplit(
  outcome: CarriedOutcome,
  { carrier, names, report }: { carrier: string; names: readonly string[]; report: unknown },
): void {
  const failed = new Set(outcome.toolErrors.map(({ tool }) => tool));
  const split = splitByTool(report, names);
  outcome.reports.set(carrier, split.own);
  for (const name of names.filter((carriedName) => !failed.has(carriedName))) {
    outcome.reports.set(name, split.carried.get(name));
    outcome.timings.set(name, 0);
  }
}

function recordMissing(outcome: CarriedOutcome, carrier: string, names: readonly string[]): void {
  const failed = new Set(outcome.toolErrors.map(({ tool }) => tool));
  for (const name of names) {
    const failure = failed.has(name) ? undefined : carrierFailure(outcome, carrier, name);
    if (failure !== undefined) {
      outcome.toolErrors.push(failure);
    }
    if (outcome.skipped.has(carrier)) {
      outcome.skipped.set(name, outcome.skipped.get(carrier));
    }
  }
}

function recordCarried(
  outcome: CarriedOutcome,
  carrier: unknown,
  carried: readonly unknown[],
): void {
  const carrierName = nameOf(carrier);
  const names = carried.map(nameOf);
  const report = outcome.reports.get(carrierName);
  if (report === undefined) {
    recordMissing(outcome, carrierName, names);
    return;
  }
  recordSplit(outcome, { carrier: carrierName, names, report });
}

export function withCarriedOutcomes<O extends CarriedOutcome>(outcome: O, plan: CarryPlan): O {
  for (const [carrier, carried] of plan.carriedBy) {
    recordCarried(outcome, carrier, carried);
  }
  return outcome;
}
