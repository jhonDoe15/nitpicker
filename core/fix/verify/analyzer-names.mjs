export const COMPILE_TOOLS = Object.freeze([
  'build',
  'kotlinc',
  'typescript-typecheck',
  'mypy',
  'pyright',
  'basedpyright',
]);

function reports(analyzer, tool) {
  return analyzer.name === tool || (analyzer.reportedTools ?? []).includes(tool);
}

export function analyzersToVerify(analyzers, tools) {
  const wanted = [...tools, ...COMPILE_TOOLS];
  return {
    names: analyzers
      .filter((analyzer) => wanted.some((tool) => reports(analyzer, tool)))
      .map(({ name }) => name),
    unmatched: tools.filter((tool) => !analyzers.some((analyzer) => reports(analyzer, tool))),
  };
}
