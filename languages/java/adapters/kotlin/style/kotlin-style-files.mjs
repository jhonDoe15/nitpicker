import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { kotlinEditorconfigValues } from '../../../conventions/editorconfig-values.mjs';
import {
  KOTLIN_INDENTATION,
  KOTLIN_LINE_LENGTH,
  KOTLIN_TRAILING_COMMAS,
  KOTLIN_WILDCARD_IMPORTS,
} from '../../../conventions/kotlin-conventions.mjs';

const EDITORCONFIG = '.editorconfig';
const KOTLIN_SECTION = '[*.{kt,kts}]';

export function projectEditorconfig(root) {
  const file = path.join(root, EDITORCONFIG);
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

export function ktlintDefaults(conventions) {
  const lines = [
    ...(conventions[KOTLIN_INDENTATION] === undefined
      ? []
      : [`indent_size = ${conventions[KOTLIN_INDENTATION]}`]),
    ...(conventions[KOTLIN_LINE_LENGTH] === undefined
      ? []
      : [`max_line_length = ${conventions[KOTLIN_LINE_LENGTH]}`]),
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

function wildcardRule(conventions, { nitpickerFirst, always }) {
  const choice = conventions[KOTLIN_WILDCARD_IMPORTS];
  const wildcard = choice === 'wildcard';
  return wildcard || nitpickerFirst || (always && choice !== undefined)
    ? ['  WildcardImport:', `    active: ${String(!wildcard)}`]
    : [];
}

function lineLengthRule(conventions) {
  return conventions[KOTLIN_LINE_LENGTH] === undefined
    ? []
    : ['  MaxLineLength:', `    maxLineLength: ${conventions[KOTLIN_LINE_LENGTH]}`];
}

export function detektConventionLayer(
  conventions,
  { nitpickerFirst = false, always = false } = {},
) {
  const rules = [
    ...wildcardRule(conventions, { nitpickerFirst, always }),
    ...lineLengthRule(conventions),
  ];
  return rules.length === 0 ? undefined : ['style:', ...rules, ''].join('\n');
}

export function detektLayers({ conventionLayer, enforcedLayer, projectConfig, nitpickerFirst }) {
  const conventions = conventionLayer === undefined ? [] : ['conventions'];
  if (projectConfig === undefined) {
    return conventions;
  }
  return nitpickerFirst
    ? ['project', ...conventions]
    : [...conventions, 'project', ...(enforcedLayer === undefined ? [] : ['enforced'])];
}

const COMMA_VALUES = { always: 'true', never: 'false' };
const WILDCARD_VALUES = { explicit: 'enabled', wildcard: 'disabled' };

function enforcedValues(conventions) {
  const comma = COMMA_VALUES[conventions[KOTLIN_TRAILING_COMMAS]];
  return Object.entries({
    indent_size: conventions[KOTLIN_INDENTATION],
    max_line_length: conventions[KOTLIN_LINE_LENGTH],
    ij_kotlin_allow_trailing_comma: comma,
    ij_kotlin_allow_trailing_comma_on_call_site: comma,
    'ktlint_standard_no-wildcard-imports': WILDCARD_VALUES[conventions[KOTLIN_WILDCARD_IMPORTS]],
  }).filter(([, value]) => value !== undefined);
}

export function enforcedEditorconfigs({ editorconfigs }, conventions) {
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
