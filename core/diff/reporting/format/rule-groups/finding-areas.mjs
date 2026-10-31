const AREA_TOOLS = [
  [
    'format',
    [
      'prettier-format',
      'ruff-format',
      'black',
      'google-java-format',
      'palantir-java-format',
      'ktfmt',
      'gofmt',
      'gofumpt',
      'goimports',
    ],
  ],
  ['types', ['typescript-typecheck', 'mypy', 'pyright', 'basedpyright', 'kotlinc', 'build']],
  [
    'lint',
    [
      'ruff',
      'python-rules',
      'import-linter',
      'dependencies',
      'pmd',
      'errorprone',
      'spotbugs',
      'checkstyle',
      'archunit',
      'spring',
      'detekt',
      'ktlint',
      'kotlin-source',
      'vet',
      'coding-standards',
      'entry-points',
      'dependency-architecture',
      'dead-code',
      'facts',
    ],
  ],
  ['structure', ['structure', 'duplicates', 'coupling', 'repository-hygiene', 'change-history']],
  ['other', []],
  ['tests', ['tests', 'test-runtime', 'test-console']],
  ['coverage', ['coverage', 'jacoco', 'coverage-py']],
  ['crap', ['crap']],
  ['mutation', ['mutation', 'pit', 'mutmut']],
];

const AREAS = AREA_TOOLS.map(([area]) => area);

const AREA_OF_TOOL = new Map(
  AREA_TOOLS.flatMap(([area, tools]) => tools.map((tool) => [tool, area])),
);

export function areaOf(tool) {
  if (tool.startsWith('eslint')) {
    return 'lint';
  }
  return AREA_OF_TOOL.get(tool) ?? 'other';
}

export function areaRank(tool) {
  return AREAS.indexOf(areaOf(tool));
}

export function areaCountLine(findings) {
  const counts = new Map();
  for (const { tool } of findings) {
    const area = areaOf(tool);
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  if (counts.size < 2) {
    return undefined;
  }
  return AREAS.filter((area) => counts.has(area))
    .map((area) => `${area} ${String(counts.get(area))}`)
    .join(' · ');
}
