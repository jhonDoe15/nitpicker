import { existsSync, readFileSync } from 'node:fs';
import type { EditorconfigEntry } from './editorconfig-mirror.mts';
import path from 'node:path';
import { kotlinEditorconfigValues } from '../../../conventions/editorconfig-values.mts';
import {
  KOTLIN_INDENTATION,
  KOTLIN_LINE_LENGTH,
  KOTLIN_TRAILING_COMMAS,
  KOTLIN_WILDCARD_IMPORTS,
} from '../../../conventions/kotlin-conventions.mts';

type LayerFlags = { nitpickerFirst: boolean; always: boolean };
export type Conventions = Readonly<Record<string, string | undefined>>;

const EDITORCONFIG = '.editorconfig';
const KOTLIN_SECTION = '[*.{kt,kts}]';

export function projectEditorconfig(root: string): string | undefined {
  const file = path.join(root, EDITORCONFIG);
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

export function ktlintDefaults(conventions: Conventions): string | undefined {
  const indentation = conventions[KOTLIN_INDENTATION];
  const length = conventions[KOTLIN_LINE_LENGTH];
  const lines = [
    ...(indentation === undefined ? [] : [`indent_size = ${indentation}`]),
    ...(length === undefined ? [] : [`max_line_length = ${length}`]),
    ...(conventions[KOTLIN_TRAILING_COMMAS] === 'never'
      ? [
          'ij_kotlin_allow_trailing_comma = false',
          'ij_kotlin_allow_trailing_comma_on_call_site = false',
        ]
      : []),
    ...(conventions[KOTLIN_WILDCARD_IMPORTS] === 'wildcard'
      ? ['ktlint_standard_no-wildcard-imports = disabled']
      : []),
  ];
  return lines.length === 0 ? undefined : [KOTLIN_SECTION, ...lines, ''].join('\n');
}

function wildcardRule(conventions: Conventions, { nitpickerFirst, always }: LayerFlags): string[] {
  const choice = conventions[KOTLIN_WILDCARD_IMPORTS];
  const wildcard = choice === 'wildcard';
  return wildcard || nitpickerFirst || (always && choice !== undefined)
    ? ['  WildcardImport:', `    active: ${String(!wildcard)}`]
    : [];
}

function lineLengthRule(conventions: Conventions): string[] {
  const length = conventions[KOTLIN_LINE_LENGTH];
  return length === undefined ? [] : ['  MaxLineLength:', `    maxLineLength: ${length}`];
}

export function detektConventionLayer(
  conventions: Conventions,
  { nitpickerFirst, always }: LayerFlags,
): string | undefined {
  const rules = [
    ...wildcardRule(conventions, { nitpickerFirst, always }),
    ...lineLengthRule(conventions),
  ];
  return rules.length === 0 ? undefined : ['style:', ...rules, ''].join('\n');
}

export function detektLayers({
  conventionLayer,
  enforcedLayer,
  projectConfig,
  nitpickerFirst,
}: {
  conventionLayer: string | undefined;
  enforcedLayer: string | undefined;
  projectConfig: unknown;
  nitpickerFirst: boolean;
}): string[] {
  const conventions = conventionLayer === undefined ? [] : ['conventions'];
  if (projectConfig === undefined) {
    return conventions;
  }
  return nitpickerFirst
    ? ['project', ...conventions]
    : [...conventions, 'project', ...(enforcedLayer === undefined ? [] : ['enforced'])];
}

const COMMA_VALUES: Readonly<Record<string, string>> = { always: 'true', never: 'false' };
const WILDCARD_VALUES: Readonly<Record<string, string>> = {
  explicit: 'enabled',
  wildcard: 'disabled',
};

function enforcedValues(conventions: Conventions): [string, string][] {
  const comma = COMMA_VALUES[conventions[KOTLIN_TRAILING_COMMAS] ?? ''];
  const entries: [string, string | undefined][] = Object.entries({
    indent_size: conventions[KOTLIN_INDENTATION],
    max_line_length: conventions[KOTLIN_LINE_LENGTH],
    ij_kotlin_allow_trailing_comma: comma,
    ij_kotlin_allow_trailing_comma_on_call_site: comma,
    'ktlint_standard_no-wildcard-imports':
      WILDCARD_VALUES[conventions[KOTLIN_WILDCARD_IMPORTS] ?? ''],
  });
  return entries.flatMap(([key, value]) => (value === undefined ? [] : [[key, value]]));
}

export function enforcedEditorconfigs(
  { editorconfigs }: { editorconfigs: EditorconfigEntry[] },
  conventions: Conventions,
): EditorconfigEntry[] {
  const expected = enforcedValues(conventions);
  return editorconfigs.map((entry) => {
    const values = kotlinEditorconfigValues(entry.text);
    const lines = expected
      .filter(([key, value]) => values[key] !== undefined && values[key] !== value)
      .map(([key, value]) => `${key} = ${value}`);
    return lines.length === 0
      ? entry
      : { ...entry, text: `${entry.text}\n${KOTLIN_SECTION}\n${lines.join('\n')}\n` };
  });
}
