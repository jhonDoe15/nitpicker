import { publicFunctionUnits } from './unused-option-units.mjs';
import { declaredNames } from '../spring/spring-names.mjs';

function skippedGaps(module) {
  return module.facts.skipped.map(({ file, test }) =>
    test
      ? { label: `the skipped test file ${file}`, tests: true, owner: module.path }
      : {
          label: `the skipped file ${file}`,
          reaches: [module.path, ...(module.manifest.projectDependencies ?? [])],
        },
  );
}

function hides(gap, module) {
  return gap.tests === true
    ? module.manifest.published === true && gap.owner === module.path
    : (gap.reaches ?? []).includes(module.path);
}

function sortedLabels(gaps) {
  return [...new Set(gaps.map(({ label }) => label))].sort();
}

export function hiddenCallers(build, module) {
  const gaps = build.memo('unused-option-gaps', () => [
    ...build.modules.flatMap(({ manifest }) => manifest.kotlinCallerGaps ?? []),
    ...build.modules.flatMap(skippedGaps),
  ]);
  return sortedLabels(gaps.filter((gap) => hides(gap, module)));
}

function byPlace(left, right) {
  return left.unit.file.localeCompare(right.unit.file) || left.unit.line - right.unit.line;
}

export function callerNote(build) {
  return build.memo('unused-option-note', () => {
    const declared = declaredNames(build.files);
    const withheld = build.modules.flatMap((module) => {
      const gaps = hiddenCallers(build, module);
      return gaps.length === 0
        ? []
        : module.facts.files
            .filter(({ test }) => !test)
            .flatMap((file) => publicFunctionUnits(file, declared))
            .map((unit) => ({ unit, module, gaps }));
    });
    const [first] = withheld.toSorted(byPlace);
    return first === undefined
      ? undefined
      : {
          reportRoot: first.module.reportRoot,
          unit: first.unit,
          gaps: [...new Set(withheld.flatMap(({ gaps }) => gaps))].sort(),
        };
  });
}
