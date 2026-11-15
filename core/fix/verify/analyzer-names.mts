import type { VerifiableAnalyzer, VerifiedAnalyzers } from './verify-types.mts';

export const COMPILE_TOOLS = Object.freeze([
  'build',
  'kotlinc',
  'typescript-typecheck',
  'mypy',
  'pyright',
  'basedpyright',
]);

function reports(analyzer: VerifiableAnalyzer, tool: string) {
  return analyzer.name === tool || (analyzer.reportedTools ?? []).includes(tool);
}

export function analyzersToVerify(
  analyzers: readonly VerifiableAnalyzer[],
  tools: readonly string[],
): VerifiedAnalyzers {
  const wanted = [...tools, ...COMPILE_TOOLS];
  return {
    names: analyzers
      .filter((analyzer) => wanted.some((tool) => reports(analyzer, tool)))
      .map(({ name }) => name),
    unmatched: tools.filter((tool) => !analyzers.some((analyzer) => reports(analyzer, tool))),
  };
}
