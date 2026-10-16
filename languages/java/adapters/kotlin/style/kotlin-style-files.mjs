import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  KOTLIN_INDENTATION,
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

export function detektConventionLayer(conventions, { nitpickerFirst = false } = {}) {
  const wildcard = conventions[KOTLIN_WILDCARD_IMPORTS] === 'wildcard';
  return wildcard || nitpickerFirst
    ? `style:\n  WildcardImport:\n    active: ${String(!wildcard)}\n`
    : undefined;
}

export function detektLayers({ conventionLayer, projectConfig, nitpickerFirst }) {
  const layers = [
    ...(conventionLayer === undefined ? [] : ['conventions']),
    ...(projectConfig === undefined ? [] : ['project']),
  ];
  return nitpickerFirst ? layers.toReversed() : layers;
}
