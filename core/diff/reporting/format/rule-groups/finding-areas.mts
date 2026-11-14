import { GO_LINTER_TOOLS } from '../../../../../languages/go/adapters/configuration/go-config.mjs';
import { textOf } from '../../../../../shared/values/readers.mts';

const goLinterTools: readonly string[] = GO_LINTER_TOOLS;

const AREA_TOOLS: readonly (readonly [string, readonly string[]])[] = [
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
      ...goLinterTools,
      'coding-standards',
      'entry-points',
      'dependency-architecture',
      'dead-code',
      'facts',
    ],
  ],
  ['structure', ['structure', 'duplicates', 'coupling', 'repository-hygiene', 'change-history']],
  ['other', []],
  ['tests', ['tests', 'race', 'test-runtime', 'test-console']],
  ['coverage', ['coverage', 'jacoco', 'coverage-py']],
  ['crap', ['crap']],
  ['mutation', ['mutation', 'pit', 'mutmut']],
];

const AREAS = AREA_TOOLS.map(([area]) => area);

const AREA_OF_TOOL = new Map(
  AREA_TOOLS.flatMap(([area, tools]) => tools.map((tool) => [tool, area])),
);

export function areaOf(tool: unknown): string {
  const name = textOf(tool);
  if (name.startsWith('eslint')) {
    return 'lint';
  }
  return AREA_OF_TOOL.get(name) ?? 'other';
}

export function areaRank(tool: unknown): number {
  return AREAS.indexOf(areaOf(tool));
}

export function areaCounts(findings: readonly { readonly tool?: unknown }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { tool } of findings) {
    const area = areaOf(tool);
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return new Map(
    AREAS.flatMap((area): [string, number][] => {
      const count = counts.get(area);
      return count === undefined ? [] : [[area, count]];
    }),
  );
}

export function areaCountLine(
  findings: readonly { readonly tool?: unknown }[],
): string | undefined {
  const counts = areaCounts(findings);
  if (counts.size < 2) {
    return undefined;
  }
  return [...counts].map(([area, count]) => `${area} ${String(count)}`).join(' · ');
}
