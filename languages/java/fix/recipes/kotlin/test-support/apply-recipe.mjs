const MAIN = 'src/main/kotlin/demo/A.kt';

export function applyRecipe(recipe, text, path = MAIN) {
  const { fixes } = recipe.plan({ files: [{ path, text }] });
  const edits = fixes
    .flatMap((fix) => fix.edits)
    .toSorted((left, right) => right.start - left.start);
  return edits.reduce(
    (result, { start, end, text: replacement }) =>
      `${result.slice(0, start)}${replacement}${result.slice(end)}`,
    text,
  );
}

export function plannedLines(recipe, text, path = MAIN) {
  return recipe.plan({ files: [{ path, text }] }).fixes.map(({ finding }) => finding.line);
}
