import { readFileSync } from 'node:fs';
import { addToGroup } from '../../../../../shared/lists/lists.mts';
import type { AnalysisClass, AnalysisFunction, SourceAnalysis } from '../typed/analysis-types.mts';
import { engineOutput, isListable, type Environment, type ListedFile } from './engine-files.mts';

type EngineAnalysis = {
  readonly summary: { readonly lines: number };
  readonly functions: readonly AnalysisFunction[];
  readonly classes: readonly AnalysisClass[];
  readonly unparsed: readonly { readonly file: string }[];
};

export type EngineMetrics = {
  readonly lines: number;
  readonly analysisOf: (display: string) => SourceAnalysis | undefined;
};

const parseAnalysis: (text: string) => EngineAnalysis = JSON.parse;

function bySource<Entry extends { readonly source: string }>(
  entries: readonly Entry[],
): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    addToGroup(groups, entry.source, entry);
  }
  return groups;
}

function metricsOf(analysis: EngineAnalysis, listed: readonly ListedFile[]): EngineMetrics {
  const unparsed = new Set(analysis.unparsed.map(({ file }) => file));
  const analyzed = new Set(
    listed.map(({ display }) => display).filter((file) => !unparsed.has(file)),
  );
  const functions = bySource(analysis.functions);
  const classes = bySource(analysis.classes);
  return {
    lines: analysis.summary.lines,
    analysisOf: (display) =>
      analyzed.has(display)
        ? {
            lines: 0,
            functions: functions.get(display) ?? [],
            classes: classes.get(display) ?? [],
          }
        : undefined,
  };
}

export function engineMetrics(
  files: readonly ListedFile[],
  environment: Environment,
): EngineMetrics | undefined {
  const listed = files.filter((file) => isListable(file));
  return engineOutput('typescript-structure', listed, environment, (out) =>
    metricsOf(parseAnalysis(readFileSync(out, 'utf8')), listed),
  );
}
