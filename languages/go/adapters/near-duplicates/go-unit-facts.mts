import type { GoUnitFact, InspectReport } from '../go-types.mts';
import { readGoUnits } from './go-trees.mts';

const PRODUCTION_SOURCE = /\.go$/u;

export function goUnitFacts(
  projectRoot: string,
  report: Pick<InspectReport, 'files'>,
): GoUnitFact[] {
  const files = report.files
    .filter(({ test, generated, path }) => !(test || generated) && PRODUCTION_SOURCE.test(path))
    .map(({ path }) => path);
  return readGoUnits(projectRoot, files).map(({ file, name, start, end, tokens, final, tree }) => ({
    file,
    name,
    start,
    end,
    tokens,
    final,
    tree,
  }));
}
