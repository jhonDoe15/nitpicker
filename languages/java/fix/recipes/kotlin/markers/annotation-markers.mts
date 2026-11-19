import { annotationMarkers as untypedAnnotationMarkers } from '../../../../adapters/kotlin/scan/rules/markers.mjs';
import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import type { KotlinFound, KotlinMarker, ScannedKotlin } from '../shared/kotlin-scan.mts';
import { removalSpan } from '../shared/spans.mts';

const TOOL = 'kotlin-source';
const EXACT_GENERATED: ReadonlySet<string> = new Set(['Generated']);

const annotationMarkers: (scanned: ScannedKotlin) => readonly KotlinMarker[] =
  untypedAnnotationMarkers;

function removals(
  rule: string,
  names?: ReadonlySet<string>,
): (scanned: ScannedKotlin) => readonly KotlinFound[] {
  return (scanned) =>
    annotationMarkers(scanned)
      .filter((marker) => marker.rule === rule && scanned.code[marker.offset - 1] !== '[')
      .filter(({ subject }) => names === undefined || names.has(subject))
      .map(({ offset, end }) => ({
        rule,
        offset,
        edits: [{ ...removalSpan(scanned.source, offset, end), text: '' }],
      }));
}

export const generatedMarkerRecipe = kotlinRecipe({
  id: 'kotlin-generated-on-hand-written-code',
  rules: [{ tool: TOOL, rule: 'GeneratedOnHandWrittenCode' }],
  find: removals('GeneratedOnHandWrittenCode', EXACT_GENERATED),
});

export const jvmSyntheticRecipe = kotlinRecipe({
  id: 'kotlin-jvm-synthetic-on-hand-written-code',
  rules: [{ tool: TOOL, rule: 'JvmSyntheticOnHandWrittenCode' }],
  safety: 'review',
  find: removals('JvmSyntheticOnHandWrittenCode'),
});

export const mutationIgnoreRecipe = kotlinRecipe({
  id: 'kotlin-mutation-ignore-marker',
  rules: [{ tool: TOOL, rule: 'MutationIgnoreMarker' }],
  safety: 'review',
  find: removals('MutationIgnoreMarker'),
});
