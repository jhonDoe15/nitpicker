import type { FixRecipe } from '../../../../../../core/fix/typed/fix-types.mts';

const MAIN = 'src/main/kotlin/demo/A.kt';

export function applyRecipe(
  recipe: FixRecipe,
  text: string,
  path: string = MAIN,
  projectRoot?: string,
): string {
  const { fixes } = recipe.plan({
    files: [{ path, text }],
    ...(projectRoot === undefined ? {} : { projectRoot }),
  });
  const edits = fixes
    .flatMap((fix) => fix.edits)
    .flatMap((edit) => (edit.type === 'replace' ? [edit] : []))
    .toSorted((left, right) => right.start - left.start);
  return edits.reduce(
    (result, { start, end, text: replacement }) =>
      `${result.slice(0, start)}${replacement}${result.slice(end)}`,
    text,
  );
}

export function plannedLines(
  recipe: FixRecipe,
  text: string,
  path: string = MAIN,
  projectRoot?: string,
): number[] {
  return recipe
    .plan({ files: [{ path, text }], ...(projectRoot === undefined ? {} : { projectRoot }) })
    .fixes.map(({ finding }) => finding.line);
}
