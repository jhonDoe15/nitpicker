import { type Inputs, touchesInputs } from '../../../shared/input-sets/inputs.mts';
import { changedFiles, type ChangedFile } from './changed-files.mts';
import { hygieneReadsContent } from './hygiene-probe.mts';
import { fieldOf } from '../../../shared/values/readers.mts';
import { appendAll } from '../../../shared/lists/items.mjs';

export type PlannedAnalyzer = {
  readonly name: string;
  readonly inputs?: unknown;
  readonly custom?: unknown;
  readonly dependencies?: readonly string[];
  readonly colocatedWith?: readonly string[];
};

type SkipSets = { readonly skipped: string[]; readonly affected: string[] };

function isInputs(value: unknown): value is Inputs {
  return typeof fieldOf(value, 'scope') === 'string';
}

function inputsOf({ inputs }: PlannedAnalyzer): Inputs | undefined {
  return isInputs(inputs) ? inputs : undefined;
}

function linked(analyzer: Partial<PlannedAnalyzer>): string[] {
  return [...(analyzer.dependencies ?? []), ...(analyzer.colocatedWith ?? [])];
}

function keepRequirements(
  analyzers: readonly PlannedAnalyzer[],
  affected: Set<string>,
): Set<string> {
  const byName = new Map(
    analyzers.map((analyzer): [string, PlannedAnalyzer] => [analyzer.name, analyzer]),
  );
  const pending = [...affected];
  for (const name of pending) {
    const required = linked(byName.get(name) ?? {}).filter(
      (name) => byName.has(name) && !affected.has(name),
    );
    for (const requiredName of required) {
      affected.add(requiredName);
    }
    appendAll(pending, required);
  }
  return affected;
}

export function planAnalyzerRuns({
  analyzers,
  changes,
  readsContent,
  roots,
}: {
  readonly analyzers: readonly PlannedAnalyzer[];
  readonly changes: readonly ChangedFile[];
  readonly readsContent: (change: ChangedFile) => boolean;
  readonly roots: readonly string[];
}): SkipSets {
  const affected = new Set(
    analyzers
      .filter(
        (analyzer) =>
          analyzer.custom === true ||
          changes.some((change) =>
            touchesInputs(inputsOf(analyzer), change, { readsContent, roots }),
          ),
      )
      .map(({ name }) => name),
  );
  keepRequirements(analyzers, affected);
  return {
    skipped: analyzers.filter(({ name }) => !affected.has(name)).map(({ name }) => name),
    affected: analyzers.filter(({ name }) => affected.has(name)).map(({ name }) => name),
  };
}

export function planSnapshotSkips({
  roots,
  analyzers,
  repositoryRoot,
  mergeBaseSha,
  headSha,
}: {
  readonly roots: readonly string[];
  readonly analyzers: readonly PlannedAnalyzer[];
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly headSha: string;
}): SkipSets {
  const snapshots = { repositoryRoot, mergeBaseSha, headSha };
  return planAnalyzerRuns({
    analyzers,
    roots,
    changes: changedFiles(snapshots),
    readsContent: hygieneReadsContent(snapshots),
  });
}
