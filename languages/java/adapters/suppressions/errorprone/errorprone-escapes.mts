import { readFileSync } from 'node:fs';
import { fieldOf, parseJson, textsOf } from '../../../../../shared/values/readers.mts';
import type { SourceViews, Suppression, WarningValue } from '../suppression-types.mts';

export const ERROR_PRONE_MESSAGE =
  'Do not silence Error Prone or NullAway inline: fix the finding (for NullAway, annotate what ' +
  'may be null with @Nullable).';
const ERROR_PRONE_NAMES = new Set(
  textsOf(
    fieldOf(
      parseJson(
        readFileSync(new URL('../../../gradle/errorprone/checks.json', import.meta.url), 'utf8'),
      ),
      'suppressible',
    ),
  ),
);
const ERROR_PRONE_TOOL = 'errorprone';
const NULL_UNMARKED = /@\s*(?:\w+\s*\.\s*)*NullUnmarked\b/gu;
const CAN_IGNORE_RETURN_VALUE = /@\s*((?:\w+\s*\.\s*)*)CanIgnoreReturnValue\b/gu;
const ERROR_PRONE_ANNOTATIONS = 'com.google.errorprone.annotations.';
const ERROR_PRONE_IMPORT =
  /\bimport\s+com\s*\.\s*google\s*\.\s*errorprone\s*\.\s*annotations\s*\.\s*(?:CanIgnoreReturnValue|\*)\s*;/u;

function silencesErrorProne(value: string, pmdNames: ReadonlySet<string>): boolean {
  return (ERROR_PRONE_NAMES.has(value) && !pmdNames.has(value)) || /^NullAway(?:\.|$)/u.test(value);
}

function projectCanIgnoreReturnValue(code: string): Suppression[] {
  const imported = ERROR_PRONE_IMPORT.test(code);
  return [...code.matchAll(CAN_IGNORE_RETURN_VALUE)]
    .filter((match) => {
      const qualifier = (match[1] ?? '').replaceAll(/\s/gu, '');
      return qualifier === '' ? !imported : qualifier !== ERROR_PRONE_ANNOTATIONS;
    })
    .map((match) => ({
      tool: ERROR_PRONE_TOOL,
      offset: match.index,
      found: '@CanIgnoreReturnValue declared by the project',
    }));
}

export function errorProneEscapes({
  views,
  warningValues,
  pmdNames,
}: {
  views: SourceViews;
  warningValues: readonly WarningValue[];
  pmdNames: ReadonlySet<string>;
}): Suppression[] {
  const suppressions = warningValues.flatMap(({ offset, values }) => {
    const silenced = values.filter((value) => silencesErrorProne(value, pmdNames));
    return silenced.length === 0
      ? []
      : [
          {
            tool: ERROR_PRONE_TOOL,
            offset,
            found: silenced.map((value) => `"${value}"`).join(', '),
          },
        ];
  });
  const unmarked = [...views.code.matchAll(NULL_UNMARKED)].map((match) => ({
    tool: ERROR_PRONE_TOOL,
    offset: match.index,
    found: '@NullUnmarked',
  }));
  return [...suppressions, ...unmarked, ...projectCanIgnoreReturnValue(views.code)];
}
