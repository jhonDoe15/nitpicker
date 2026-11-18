import { COMPILE_TOOLS } from './analyzer-names.mts';
import type {
  AnalyzedFinding,
  CountedFinding,
  Comparison,
  Counts,
  FindingKey,
  Judgement,
  RunEvent,
  RecipeRun,
} from './verify-types.mts';
import { appendAll } from '../../../shared/lists/lists.mts';

function keyOf({ tool, rule, path }: FindingKey) {
  return `${tool}\0${rule}\0${path}`;
}

export function countFindings(findings: readonly AnalyzedFinding[]): Counts {
  const counts = new Map<string, CountedFinding>();
  for (const finding of findings.filter(({ classification }) => classification === 'enforceable')) {
    const key = keyOf(finding);
    const entry = counts.get(key) ?? { ...finding, count: 0 };
    counts.set(key, { ...entry, count: entry.count + 1 });
  }
  return counts;
}

function runKey(recipe: string, scope: string | undefined, files: readonly string[]) {
  return scope === 'file' ? [recipe, ...files.toSorted()].join('\0') : recipe;
}

export function recipeRuns(events: readonly RunEvent[]): RecipeRun[] {
  const runs = new Map<string, RecipeRun>();
  for (const { recipe, scope, files, finding, alsoFindings = [] } of events) {
    if (recipe === undefined) {
      continue;
    }
    const key = runKey(recipe, scope, files);
    const run = runs.get(key) ?? { key, id: recipe, files: new Set<string>(), findings: [] };
    for (const name of files) {
      run.files.add(name);
    }
    if (finding !== undefined) {
      run.findings.push(finding);
    }
    appendAll(run.findings, alsoFindings);
    runs.set(key, run);
  }
  return [...runs.values()];
}

function stillThere(run: RecipeRun, { before, after }: Comparison) {
  const fixed = Map.groupBy(run.findings, keyOf);
  return [...fixed]
    .filter(([key, entries]) => {
      const was = before.get(key)?.count ?? 0;
      return was > 0 && (after.get(key)?.count ?? 0) > was - entries.length;
    })
    .flatMap(([, [first]]) => (first === undefined ? [] : [first]))
    .map(({ tool, rule, path }) => `${tool}/${rule} is still reported in ${path}`);
}

function introduced({ tool, rule, path }: FindingKey) {
  return COMPILE_TOOLS.includes(tool)
    ? `breaks the compile or type check: new ${tool}/${rule} in ${path}`
    : `adds ${tool}/${rule} in ${path}`;
}

export function judgeFindings({ runs, before, after, breaking }: Judgement): Map<string, string[]> {
  const reasons = new Map<string, Set<string>>(
    runs.map((run) => [run.key, new Set(stillThere(run, { before, after }))]),
  );
  for (const [key, finding] of after) {
    if (finding.count <= (before.get(key)?.count ?? 0)) {
      continue;
    }
    const owners = runs.filter((run) => run.files.has(finding.path));
    const blamed = owners.length > 0 || !breaking(finding.tool) ? owners : runs;
    for (const { key: owner } of blamed) {
      reasons.get(owner)?.add(introduced(finding));
    }
  }
  return new Map(
    [...reasons].filter(([, found]) => found.size > 0).map(([id, found]) => [id, [...found]]),
  );
}

export function withSharedFiles(
  runs: readonly RecipeRun[],
  reasons: ReadonlyMap<string, readonly string[]>,
): Map<string, readonly string[]> {
  const rolled = new Map(reasons);
  const queue = runs.filter(({ key }) => rolled.has(key));
  for (const source of queue) {
    const mates = runs.filter(
      (run) => !rolled.has(run.key) && [...run.files].some((name) => source.files.has(name)),
    );
    for (const mate of mates) {
      rolled.set(mate.key, [`shares a file with ${source.id}, which was rolled back`]);
    }
    appendAll(queue, mates);
  }
  return rolled;
}
