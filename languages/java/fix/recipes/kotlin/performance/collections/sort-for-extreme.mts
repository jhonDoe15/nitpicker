import { kotlinRecipe } from '../../shared/kotlin-recipe.mts';
import { closingIndex } from '../../shared/kotlin-scan.mts';
import type { KotlinFound, ScannedKotlin } from '../../shared/kotlin-scan.mts';

const SORT_CALL =
  /\.\s*(sorted|sortedDescending|sortedBy|sortedByDescending|sortedWith)(?=\s*[({])/gu;
const TAKE = /^\s*\.\s*(first|firstOrNull)\s*\(\s*\)/u;
const OPENING = /^\s*([({])/u;
const TRAILING_LAMBDA = /^[ \t]*\{/u;
const LABEL = /@sorted\w*/u;
const PLAIN = 'plain';
const SELECTOR = 'selector';
const COMPARATOR = 'comparator';

type Replacement = {
  readonly min: string;
  readonly minOrNull: string;
  readonly shape: typeof PLAIN | typeof SELECTOR | typeof COMPARATOR;
};

const REPLACEMENTS: Readonly<Record<string, Replacement>> = {
  sorted: { min: 'minWith', minOrNull: 'minWithOrNull', shape: PLAIN },
  sortedDescending: { min: 'maxWith', minOrNull: 'maxWithOrNull', shape: PLAIN },
  sortedBy: { min: 'minBy', minOrNull: 'minByOrNull', shape: SELECTOR },
  sortedByDescending: { min: 'maxBy', minOrNull: 'maxByOrNull', shape: SELECTOR },
  sortedWith: { min: 'minWith', minOrNull: 'minWithOrNull', shape: COMPARATOR },
};

type Candidate = {
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

type Site = {
  readonly replacement: Replacement;
  readonly bracket: string;
  readonly nameEnd: number;
  readonly open: number;
  readonly close: number;
};

function acceptedShape(shape: Replacement['shape'], bracket: string, argument: string): boolean {
  if (shape === PLAIN) {
    return bracket === '(' && argument.trim() === '';
  }
  if (shape === COMPARATOR) {
    return bracket === '(' && argument.trim() !== '' && !LABEL.test(argument);
  }
  return argument.trim() !== '' && !LABEL.test(argument);
}

function lineRest(code: string, from: number): string {
  const newline = code.indexOf('\n', from);
  return code.slice(from, newline === -1 ? code.length : newline);
}

function siteOf(code: string, match: RegExpMatchArray): Site | undefined {
  const { index = 0, 0: head, 1: name = '' } = match;
  const replacement = REPLACEMENTS[name];
  const nameEnd = index + head.length;
  const opening = OPENING.exec(code.slice(nameEnd));
  if (
    replacement === undefined ||
    opening === null ||
    code.slice(0, index).trimEnd().endsWith('?')
  ) {
    return undefined;
  }
  const open = nameEnd + opening[0].length - 1;
  return { replacement, bracket: opening[1] ?? '', nameEnd, open, close: closingIndex(code, open) };
}

function hasTrailingLambda(code: string, site: Site, end: number): boolean {
  return (
    TRAILING_LAMBDA.test(lineRest(code, end)) ||
    (site.bracket === '(' && TRAILING_LAMBDA.test(lineRest(code, site.close + 1)))
  );
}

function argumentText(source: string, site: Site): string {
  const { replacement, nameEnd, open, close } = site;
  if (replacement.shape === PLAIN) {
    return '(naturalOrder())';
  }
  if (replacement.shape === COMPARATOR) {
    return source.slice(nameEnd, close + 1);
  }
  const separator = site.bracket === '{' ? ' ' : '';
  return `(compareBy${separator}${source.slice(open, close + 1)})`;
}

function candidateAt(scanned: ScannedKotlin, match: RegExpMatchArray): Candidate | undefined {
  const { code, source } = scanned;
  const site = siteOf(code, match);
  if (site === undefined) {
    return undefined;
  }
  const take = TAKE.exec(code.slice(site.close + 1));
  if (take === null) {
    return undefined;
  }
  const { replacement, close } = site;
  const end = close + 1 + take[0].length;
  const argument = code.slice(site.open + 1, close);
  if (
    !acceptedShape(replacement.shape, site.bracket, argument) ||
    hasTrailingLambda(code, site, end)
  ) {
    return undefined;
  }
  const method = take[1] === 'first' ? replacement.min : replacement.minOrNull;
  const wrapped = replacement.shape === SELECTOR ? method.replace(/By/u, 'With') : method;
  return { start: match.index ?? 0, end, text: `.${wrapped}${argumentText(source, site)}` };
}

export const sortForExtremeRecipe = kotlinRecipe({
  id: 'kotlin-sort-for-extreme',
  rules: [{ tool: 'kotlin-source', rule: 'SortForExtreme' }],
  safety: 'review',
  keepComments: true,
  find(scanned): readonly KotlinFound[] {
    const found = [...scanned.code.matchAll(SORT_CALL)].flatMap((match) => {
      const candidate = candidateAt(scanned, match);
      return candidate === undefined ? [] : [candidate];
    });
    return found
      .filter(
        (outer) =>
          !found.some(
            (inner) => inner !== outer && outer.start < inner.start && inner.end <= outer.end,
          ),
      )
      .map(({ start, end, text }) => ({ offset: start, edits: [{ start, end, text }] }));
  },
});
