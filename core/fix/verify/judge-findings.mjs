import { COMPILE_TOOLS } from './analyzer-names.mjs';

function keyOf({ tool, rule, path }) {
  return `${tool}\0${rule}\0${path}`;
}

export function countFindings(findings) {
  const counts = new Map();
  for (const finding of findings.filter(({ classification }) => classification === 'enforceable')) {
    const key = keyOf(finding);
    const entry = counts.get(key) ?? { ...finding, count: 0 };
    counts.set(key, { ...entry, count: entry.count + 1 });
  }
  return counts;
}

export function recipeRuns(events) {
  const runs = new Map();
  for (const { recipe, files, finding } of events.filter((event) => event.recipe !== undefined)) {
    const run = runs.get(recipe) ?? { id: recipe, files: new Set(), findings: [] };
    for (const name of files) {
      run.files.add(name);
    }
    run.findings.push(finding);
    runs.set(recipe, run);
  }
  return [...runs.values()];
}

function stillThere(run, { before, after }) {
  const fixed = Map.groupBy(run.findings, keyOf);
  return [...fixed]
    .filter(([key, entries]) => {
      const was = before.get(key)?.count ?? 0;
      return was > 0 && (after.get(key)?.count ?? 0) > was - entries.length;
    })
    .map(([, [{ tool, rule, path }]]) => `${tool}/${rule} is still reported in ${path}`);
}

function introduced({ tool, rule, path }) {
  return COMPILE_TOOLS.includes(tool)
    ? `breaks the compile or type check: new ${tool}/${rule} in ${path}`
    : `adds ${tool}/${rule} in ${path}`;
}

export function judgeFindings({ runs, before, after, breaking }) {
  const reasons = new Map(runs.map((run) => [run.id, new Set(stillThere(run, { before, after }))]));
  for (const [key, finding] of after) {
    if (finding.count <= (before.get(key)?.count ?? 0)) {
      continue;
    }
    const owners = runs.filter((run) => run.files.has(finding.path));
    const blamed = owners.length > 0 || !breaking(finding.tool) ? owners : runs;
    for (const { id } of blamed) {
      reasons.get(id).add(introduced(finding));
    }
  }
  return new Map(
    [...reasons].filter(([, found]) => found.size > 0).map(([id, found]) => [id, [...found]]),
  );
}

export function withSharedFiles(runs, reasons) {
  const rolled = new Map(reasons);
  const queue = runs.filter(({ id }) => rolled.has(id));
  for (const source of queue) {
    const mates = runs.filter(
      (run) => !rolled.has(run.id) && [...run.files].some((name) => source.files.has(name)),
    );
    for (const mate of mates) {
      rolled.set(mate.id, [`shares a file with ${source.id}, which was rolled back`]);
    }
    queue.push(...mates);
  }
  return rolled;
}
