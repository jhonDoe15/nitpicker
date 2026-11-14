import { COMPILE_TOOLS } from './analyzer-names.mjs';
import { countFindings, judgeFindings, recipeRuns, withSharedFiles } from './judge-findings.mjs';
import { restoreFiles, withOriginals } from './tree-states.mjs';

function breakingIn(mode) {
  return (tool) => COMPILE_TOOLS.includes(tool) || (mode === 'full' && tool === 'tests');
}

function rollbackNote({ id, files }, reasons) {
  return `--fix rolled back ${id} (${[...files].join(', ')}): ${reasons.join('; ')}`;
}

function analysisOf(analyze, request) {
  const { findings, errors = [], unmatched = [] } = analyze(request);
  return { findings: countFindings(findings), errors, unmatched };
}

function skipped(message) {
  return { rolledBack: [], notes: [`--fix could not verify the fixes: ${message}`] };
}

function bothAnalyses(journal, analyze, request) {
  try {
    const after = analysisOf(analyze, request);
    const before = withOriginals(journal, request.files, () => analysisOf(analyze, request));
    const errors = [...new Set([...after.errors, ...before.errors])];
    return errors.length > 0 ? { failure: errors.join('; ') } : { after, before };
  } catch (error) {
    return { failure: error.message };
  }
}

function rollBack(journal, candidates) {
  const names = new Set(candidates.flatMap((run) => [...run.files]));
  const edited = new Set(restoreFiles(journal, [...names]));
  const rolled = candidates.filter((run) => ![...run.files].some((name) => edited.has(name)));
  const restored = new Set(rolled.flatMap((run) => [...run.files]));
  journal.events = journal.events.filter(({ files }) => !files.every((name) => restored.has(name)));
  return { rolled, kept: candidates.filter((run) => !rolled.includes(run)) };
}

function keptNote({ id, files }) {
  return `--fix could not roll back ${id} (${[...files].join(', ')}): a file changed while --fix ran, left as is`;
}

export function verifyFixes({ journal, analyze, mode = 'narrow' }) {
  const runs = recipeRuns(journal.events);
  if (runs.length === 0) {
    return { rolledBack: [], notes: [] };
  }
  const tools = runs.flatMap((run) => run.findings.map(({ tool }) => tool));
  const files = runs.flatMap((run) => [...run.files]);
  const request = { tools: [...new Set(tools)], files: [...new Set(files)], mode };
  const { after, before, failure } = bothAnalyses(journal, analyze, request);
  if (failure !== undefined) {
    return skipped(failure);
  }
  const reasons = withSharedFiles(
    runs,
    judgeFindings({
      runs,
      before: before.findings,
      after: after.findings,
      breaking: breakingIn(mode),
    }),
  );
  const { rolled, kept } = rollBack(
    journal,
    runs.filter(({ id }) => reasons.has(id)),
  );
  return {
    rolledBack: rolled.map((run) => ({
      recipe: run.id,
      files: [...run.files],
      reasons: reasons.get(run.id),
    })),
    notes: [
      ...after.unmatched.map((tool) => `--fix could not verify ${tool}: no analyzer reports it`),
      ...rolled.map((run) => rollbackNote(run, reasons.get(run.id))),
      ...kept.map(keptNote),
    ],
  };
}
