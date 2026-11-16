import { entryForFinding, referenceLinks } from '../../shared/reference/store.mjs';
import { goLabels } from './go-labels.mts';
import { LABELS } from './taxonomy.mts';
import { fieldOf, textOf, textsOf } from '../../shared/values/readers.mts';

type Labels = readonly string[];
type Located = { readonly tool?: unknown; readonly rule?: unknown };

export type LabelsOf = (finding: Located) => Labels;

type AreaOf = (tool: string) => string;

type LabelerSource = { readonly areaOf: AreaOf; readonly index?: () => unknown };

const findEntry: (index: unknown, finding: { tool: string; rule: string }) => unknown =
  entryForFinding;
const links: () => { index(): unknown } = referenceLinks;

const TESTS: Labels = ['tests'];
const AREA_LABELS: ReadonlyMap<string, Labels> = new Map([
  ['format', ['style']],
  ['types', ['bug']],
  ['tests', TESTS],
  ['coverage', TESTS],
  ['crap', TESTS],
  ['mutation', TESTS],
]);
const FALLBACK: Labels = ['maintainability'];

export function fallbackLabels(area: string): Labels {
  return AREA_LABELS.get(area) ?? FALLBACK;
}

function entryLabels(index: unknown, tool: string, rule: string): Labels | undefined {
  const labels = textsOf(fieldOf(findEntry(index, { tool, rule }), 'labels')).filter((label) =>
    LABELS.includes(label),
  );
  return labels.length === 0 ? undefined : labels;
}

const SHARED_LINKS = links();

function referenceIndex(): unknown {
  return SHARED_LINKS.index();
}

export function findingLabeler({ areaOf, index = referenceIndex }: LabelerSource): LabelsOf {
  const cache = new Map<string, Labels>();
  return ({ tool, rule }) => {
    const toolName = textOf(tool ?? '');
    const ruleName = textOf(rule ?? '');
    const key = `${toolName}\0${ruleName}`;
    const known = cache.get(key);
    if (known !== undefined) {
      return known;
    }
    const labels =
      goLabels(toolName, ruleName) ??
      entryLabels(index(), toolName, ruleName) ??
      fallbackLabels(areaOf(toolName));
    cache.set(key, labels);
    return labels;
  };
}

export function withLabels<T extends Located>(findings: readonly T[], labelsOf: LabelsOf): T[] {
  return findings.map((finding) => ({ ...finding, labels: [...labelsOf(finding)] }));
}

export function labelCounts(
  findings: readonly { readonly labels?: unknown }[],
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    for (const label of textsOf(finding.labels)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return Object.fromEntries(
    LABELS.flatMap((label) => {
      const count = counts.get(label);
      return count === undefined ? [] : [[label, count]];
    }),
  );
}
