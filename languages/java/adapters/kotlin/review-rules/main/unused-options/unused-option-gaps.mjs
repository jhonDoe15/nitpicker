import { limitedUnits, publicFunctionUnits } from './unused-option-units.mjs';
import { declaredNames } from '../../spring/spring-names.mjs';

function skippedGaps(module) {
  return module.facts.skipped.map(({ file, test }) =>
    test
      ? { label: `the skipped test file ${file}`, tests: true, owner: module.path }
      : {
          label: `the skipped file ${file}`,
          owner: module.path,
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

function buildGaps(build) {
  return build.memo('unused-option-gaps', () => [
    ...build.modules.flatMap(({ manifest }) => manifest.kotlinCallerGaps ?? []),
    ...build.modules.flatMap(skippedGaps),
  ]);
}

export function hiddenCallers(build, module) {
  return sortedLabels(buildGaps(build).filter((gap) => hides(gap, module)));
}

export function hiddenInternalCallers(build, module) {
  return sortedLabels(buildGaps(build).filter((gap) => gap.owner === module.path));
}

function compareText(left, right) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function byPlace(left, right) {
  return compareText(left.unit.file, right.unit.file) || left.unit.line - right.unit.line;
}

function withheldUnits(build, module, declared) {
  const files = module.facts.files.filter(({ test }) => !test);
  const publicGaps = hiddenCallers(build, module);
  const internalGaps = hiddenInternalCallers(build, module);
  return [
    ...(publicGaps.length === 0
      ? []
      : files
          .flatMap((file) => publicFunctionUnits(file, declared))
          .map((unit) => ({ unit, module, gaps: publicGaps }))),
    ...(internalGaps.length === 0
      ? []
      : files
          .flatMap((file) => limitedUnits(file, false))
          .filter(({ internal }) => internal)
          .map((unit) => ({ unit, module, gaps: internalGaps }))),
  ];
}

function withheldKinds(withheld) {
  const internal = withheld.some(({ unit }) => unit.internal);
  const exposed = withheld.some(({ unit }) => !unit.limited);
  if (internal && exposed) {
    return 'Public and internal functions';
  }
  return internal ? 'Internal functions' : 'Public functions';
}

export function callerNote(build) {
  return build.memo('unused-option-note', () => {
    const declared = declaredNames(build.files);
    const withheld = build.modules.flatMap((module) => withheldUnits(build, module, declared));
    const [first] = withheld.toSorted(byPlace);
    return first === undefined
      ? undefined
      : {
          reportRoot: first.module.reportRoot,
          unit: first.unit,
          kinds: withheldKinds(withheld),
          gaps: [...new Set(withheld.flatMap(({ gaps }) => gaps))].sort(),
        };
  });
}
