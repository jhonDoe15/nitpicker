import { COMPILE_TOOLS } from './analyzer-names.mts';
import { countFindings, judgeFindings, recipeRuns, withSharedFiles } from './judge-findings.mts';
import { restoreFiles, withOriginals } from './tree-states.mts';
import { messageOf } from '../../../shared/values/readers.mts';
import { findingLabeler } from '../../labels/finding-labels.mts';
import type { Journal } from '../dry-run/journal-types.mts';
import {
  isAnalyze,
  type Analyze,
  type Analyses,
  type Analysis,
  type VerifyRequest,
  type AnalyzeRequest,
  type FindingKey,
  type RecipeRun,
  type VerifyResult,
} from './verify-types.mts';

const SURFACED_LABELS = new Set(['simplification']);
const labelsOf = findingLabeler({ areaOf: () => 'other' });

function onlySimplifies(finding: FindingKey) {
  const labels = labelsOf(finding);
  return labels.length > 0 && labels.every((label) => SURFACED_LABELS.has(label));
}

function breakingIn(mode: string) {
  return (tool: string) => COMPILE_TOOLS.includes(tool) || (mode === 'full' && tool === 'tests');
}

function rollbackNote({ id, files }: RecipeRun, reasons: readonly string[]) {
  return `--fix rolled back ${id} (${[...files].join(', ')}): ${reasons.join('; ')}`;
}

function analysisOf(analyze: Analyze, request: AnalyzeRequest): Analysis {
  const { findings, errors = [], unmatched = [] } = analyze(request);
  return { findings: countFindings(findings), errors, unmatched };
}

function skipped(message: string): VerifyResult {
  return { rolledBack: [], notes: [`--fix could not verify the fixes: ${message}`] };
}

function bothAnalyses(journal: Journal, analyze: unknown, request: AnalyzeRequest): Analyses {
  try {
    if (!isAnalyze(analyze)) {
      throw new TypeError('analyze is not a function');
    }
    const after = analysisOf(analyze, request);
    const before = withOriginals(journal, request.files, () => analysisOf(analyze, request));
    const errors = [...new Set([...after.errors, ...before.errors])];
    return errors.length > 0 ? { failure: errors.join('; ') } : { after, before };
  } catch (error) {
    return { failure: messageOf(error) };
  }
}

function rollBack(journal: Journal, candidates: readonly RecipeRun[]) {
  const names = new Set(candidates.flatMap((run) => [...run.files]));
  const edited = new Set(restoreFiles(journal, [...names]));
  const rolled = candidates.filter((run) => ![...run.files].some((name) => edited.has(name)));
  const restored = new Set(rolled.flatMap((run) => [...run.files]));
  journal.events = journal.events.filter(({ files }) => !files.every((name) => restored.has(name)));
  return { rolled, kept: candidates.filter((run) => !rolled.includes(run)) };
}

function keptNote({ id, files }: RecipeRun) {
  return `--fix could not roll back ${id} (${[...files].join(', ')}): a file changed while --fix ran, left as is`;
}

export function verifyFixes({ journal, analyze, mode = 'narrow' }: VerifyRequest): VerifyResult {
  const runs = recipeRuns(journal.events);
  if (runs.length === 0) {
    return { rolledBack: [], notes: [] };
  }
  const tools = runs.flatMap((run) => run.findings.map(({ tool }) => tool));
  const files = runs.flatMap((run) => [...run.files]);
  const request = { tools: [...new Set(tools)], files: [...new Set(files)], mode };
  const analyses = bothAnalyses(journal, analyze, request);
  if (analyses.failure !== undefined) {
    return skipped(analyses.failure);
  }
  const { after, before } = analyses;
  const reasons = withSharedFiles(
    runs,
    judgeFindings({
      runs,
      before: before.findings,
      after: after.findings,
      breaking: breakingIn(mode),
      surfaced: onlySimplifies,
    }),
  );
  const { rolled, kept } = rollBack(
    journal,
    runs.filter(({ key }) => reasons.has(key)),
  );
  return {
    rolledBack: rolled.map((run) => ({
      recipe: run.id,
      files: [...run.files],
      reasons: reasons.get(run.key) ?? [],
    })),
    notes: [
      ...after.unmatched.map((tool) => `--fix could not verify ${tool}: no analyzer reports it`),
      ...rolled.map((run) => rollbackNote(run, reasons.get(run.key) ?? [])),
      ...kept.map(keptNote),
    ],
  };
}
