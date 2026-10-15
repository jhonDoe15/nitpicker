export function fn(name, parameters, { complexity = 1, file = 'src/demo/a.py' } = {}) {
  return {
    file,
    name,
    start: 4,
    definition: 4,
    bodyStart: 5,
    end: 5,
    lines: 2,
    statements: 1,
    maxControlNesting: 0,
    parameters,
    complexity,
  };
}

export function coverageOf(...names) {
  return JSON.stringify({
    files: {
      'src/demo/a.py': {
        functions: Object.fromEntries(
          names.map((name) => [
            name,
            {
              executed_lines: [],
              missing_lines: [5],
              summary: {
                num_statements: 1,
                covered_lines: 0,
                num_branches: 0,
                covered_branches: 0,
              },
            },
          ]),
        ),
      },
    },
  });
}

export function enforceable(result) {
  return result
    .json('new-findings.json')
    .filter(({ classification }) => classification === 'enforceable')
    .map(({ tool, rule, symbol, message }) => ({ tool, rule, symbol, message }));
}
