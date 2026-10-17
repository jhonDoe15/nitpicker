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
const LIMIT_KEYS = [
  [KOTLIN_INDENTATION, 'indent_size'],
  [KOTLIN_LINE_LENGTH, 'max_line_length'],
];

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

function wildcardRule(conventions, nitpickerFirst) {
  const wildcard = conventions[KOTLIN_WILDCARD_IMPORTS] === 'wildcard';
  return wildcard || nitpickerFirst
    ? ['  WildcardImport:', `    active: ${String(!wildcard)}`]
    : [];
}

function lineLengthRule(conventions) {
  return conventions[KOTLIN_LINE_LENGTH] === undefined
    ? []
    : ['  MaxLineLength:', `    maxLineLength: ${conventions[KOTLIN_LINE_LENGTH]}`];
}

export function detektConventionLayer(conventions, { nitpickerFirst = false } = {}) {
  const rules = [...wildcardRule(conventions, nitpickerFirst), ...lineLengthRule(conventions)];
  return rules.length === 0 ? undefined : ['style:', ...rules, ''].join('\n');
}

export function detektLayers({ conventionLayer, projectConfig, nitpickerFirst }) {
  if (conventionLayer === undefined || projectConfig === undefined) {
    return [
      ...(conventionLayer === undefined ? [] : ['conventions']),
      ...(projectConfig === undefined ? [] : ['project']),
    ];
  }
  return nitpickerFirst ? ['project', 'conventions'] : ['conventions', 'project', 'conventions'];
}

export function enforcedEditorconfigs({ editorconfigs, offset }, conventions) {
  const projectFile = offset === '' ? EDITORCONFIG : `${offset}/${EDITORCONFIG}`;
  return editorconfigs.map((entry) => {
    const values = entry.path === projectFile ? kotlinEditorconfigValues(entry.text) : {};
    const lines = LIMIT_KEYS.filter(
      ([id, key]) =>
        conventions[id] !== undefined &&
        values[key] !== undefined &&
        values[key] !== conventions[id],
    ).map(([id, key]) => `${key} = ${conventions[id]}`);
    return lines.length === 0
      ? entry
      : { ...entry, text: `${entry.text}\n${KOTLIN_SECTION}\n${lines.join('\n')}\n` };
  });
}
