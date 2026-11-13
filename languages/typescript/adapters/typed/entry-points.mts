import type { Finding } from '../static-checks/shared.mts';
import type { CruiseReport } from './static-checks.mts';
import type { Layout } from './head-policy.mts';
import { toEntryPointDiffFindings as untypedToEntryPointDiffFindings } from '../entry-points.mjs';

type PublicAlternativeBypass = {
  readonly source: string;
  readonly target: string;
  readonly publicEntryPoint: string;
  readonly dependencyKind: string;
};

export type EntryPointReport = {
  readonly publicAlternativeBypasses: readonly PublicAlternativeBypass[];
};

export type AnalyzeEntryPoints = (
  graph: CruiseReport,
  sourceRoot: string,
  options: { readonly layout: Layout },
) => EntryPointReport;

export const toEntryPointDiffFindings: (report: EntryPointReport) => Finding[] =
  untypedToEntryPointDiffFindings;

function isAnalyzer(value: unknown): value is AnalyzeEntryPoints {
  return typeof value === 'function';
}

export async function importEntryPointAnalyzer(url: string): Promise<AnalyzeEntryPoints> {
  const loaded: unknown = await import(url);
  if (
    typeof loaded !== 'object' ||
    loaded === null ||
    !('analyzeEntryPoints' in loaded) ||
    !isAnalyzer(loaded.analyzeEntryPoints)
  ) {
    throw new TypeError(`${url} does not export analyzeEntryPoints`);
  }
  return loaded.analyzeEntryPoints;
}
