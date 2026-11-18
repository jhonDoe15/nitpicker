import type { FactsModule, FactsView } from '../../typed/review-context-types.mts';
import type { CallerGap } from './unused-option-types.mts';
import type { CallerNote, OptionUnit } from './unused-option-sites.mts';
import { limitedUnits, publicFunctionUnits } from './unused-option-units.mts';
import { declaredNames } from '../../spring/spring-names.mts';
import { compareText as untypedCompareText } from '../../../../../../../shared/paths/path-order.mjs';

const compareText: (left: string, right: string) => number = untypedCompareText;
const declaredOf: (files: FactsView['files']) => Set<string> = declaredNames;

type Withheld = { unit: OptionUnit; module: FactsModule; gaps: string[] };

function skippedGaps(module: FactsModule): CallerGap[] {
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

function hides(gap: CallerGap, module: FactsModule): boolean {
  return gap.tests === true
    ? module.manifest['published'] === true && gap.owner === module.path
    : (gap.reaches ?? []).includes(module.path);
}

function sortedLabels(gaps: CallerGap[]): string[] {
  return [...new Set(gaps.map(({ label }) => label))].sort();
}

function isGapList(value: unknown): value is CallerGap[] {
  return Array.isArray(value);
}

function buildGaps(build: FactsView): CallerGap[] {
  return build.memo(
    'unused-option-gaps',
    () => [
      ...build.modules.flatMap(({ manifest }) => manifest.kotlinCallerGaps ?? []),
      ...build.modules.flatMap(skippedGaps),
    ],
    isGapList,
  );
}

export function hiddenCallers(build: FactsView, module: FactsModule): string[] {
  return sortedLabels(buildGaps(build).filter((gap) => hides(gap, module)));
}

export function hiddenInternalCallers(build: FactsView, module: FactsModule): string[] {
  return sortedLabels(buildGaps(build).filter((gap) => gap.owner === module.path));
}

function byPlace(left: Withheld, right: Withheld): number {
  return compareText(left.unit.file, right.unit.file) || left.unit.line - right.unit.line;
}

function withheldUnits(build: FactsView, module: FactsModule, declared: Set<string>): Withheld[] {
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

function withheldKinds(withheld: Withheld[]): string {
  const internal = withheld.some(({ unit }) => unit.internal);
  const exposed = withheld.some(({ unit }) => !unit.limited);
  if (internal && exposed) {
    return 'Public and internal functions';
  }
  return internal ? 'Internal functions' : 'Public functions';
}

function isNote(value: unknown): value is CallerNote | undefined {
  return value === undefined || (typeof value === 'object' && value !== null);
}

export function callerNote(build: FactsView): CallerNote | undefined {
  return build.memo(
    'unused-option-note',
    () => {
      const declared = declaredOf(build.files);
      const withheld = build.modules.flatMap((module) => withheldUnits(build, module, declared));
      const first =
        withheld.length === 0
          ? undefined
          : withheld.reduce((best, entry) => (byPlace(entry, best) < 0 ? entry : best));
      return first === undefined
        ? undefined
        : {
            reportRoot: first.module.reportRoot,
            unit: first.unit,
            kinds: withheldKinds(withheld),
            gaps: [...new Set(withheld.flatMap(({ gaps }) => gaps))].sort(),
          };
    },
    isNote,
  );
}
