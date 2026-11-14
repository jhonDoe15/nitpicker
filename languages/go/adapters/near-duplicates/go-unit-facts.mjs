import { readGoUnits } from './go-trees.mjs';

const PRODUCTION_SOURCE = /\.go$/u;

export function goUnitFacts(projectRoot, report) {
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
