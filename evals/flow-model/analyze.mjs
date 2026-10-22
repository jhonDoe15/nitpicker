import { analyzeModel } from './check/analyze.mjs';
import { extractModel } from './extract/extract.mjs';

export { ANALYZER_VERSION } from './extract/extract.mjs';
export { DEFAULT_BOUNDS, traceOf } from './check/analyze.mjs';

export function analyzeSource({ file, text, entry, contracts, inputs = {}, bounds = {} }) {
  const model = extractModel({ file, text, entry });
  const result = analyzeModel(model, { contracts, inputs, bounds });
  return { model, result };
}
