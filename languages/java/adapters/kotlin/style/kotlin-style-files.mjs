import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
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
  const layers = [
    ...(conventionLayer === undefined ? [] : ['conventions']),
    ...(projectConfig === undefined ? [] : ['project']),
  ];
  return nitpickerFirst ? layers.toReversed() : layers;
}
