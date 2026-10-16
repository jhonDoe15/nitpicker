import { readFileSync } from 'node:fs';
import path from 'node:path';
import { precedenceLayers } from '../../../shared/tool-precedence.mjs';
import { projectEditorconfig } from '../adapters/kotlin/kotlin-style-files.mjs';
import {
  declaredKtfmtStyle,
  detektConfigOf,
  kotlinFormatterOf,
} from '../adapters/kotlin/kotlin-tools.mjs';
import { detektWildcardActive, kotlinEditorconfigValues } from './editorconfig-values.mjs';
import {
  KOTLIN_INDENTATION,
  KOTLIN_TRAILING_COMMAS,
  KOTLIN_WILDCARD_IMPORTS,
} from './kotlin-conventions.mjs';

const KTFMT_INDENTATION = { kotlinlang: '4', meta: '2', google: '2' };
const COMMA_CHOICES = { true: 'always', false: 'never' };
const WILDCARD_CHOICES = { disabled: 'wildcard', enabled: 'explicit' };
const DETEKT_WILDCARD_CHOICES = { true: 'explicit', false: 'wildcard' };
const NO_FORMATTER = 'no Kotlin formatter runs';

function choicesFrom(from, candidates) {
  return Object.fromEntries(
    Object.entries(candidates)
      .filter(([, choice]) => choice !== undefined)
      .map(([id, choice]) => [id, { choice, from }]),
  );
}

function editorconfigValues(root) {
  const text = projectEditorconfig(root);
  return text === undefined ? undefined : kotlinEditorconfigValues(text);
}

function ktlintChoices(root) {
  const values = editorconfigValues(root);
  if (values === undefined) {
    return {};
  }
  const commas =
    values.ij_kotlin_allow_trailing_comma ?? values.ij_kotlin_allow_trailing_comma_on_call_site;
  return choicesFrom('your .editorconfig', {
    [KOTLIN_INDENTATION]: values.indent_size,
    [KOTLIN_TRAILING_COMMAS]: COMMA_CHOICES[commas],
    [KOTLIN_WILDCARD_IMPORTS]: WILDCARD_CHOICES[values['ktlint_standard_no-wildcard-imports']],
  });
}

function ktfmtChoices(root) {
  const indentSize = editorconfigValues(root)?.indent_size;
  return indentSize === undefined
    ? choicesFrom('your build file', {
        [KOTLIN_INDENTATION]: KTFMT_INDENTATION[declaredKtfmtStyle(root)],
      })
    : choicesFrom('your .editorconfig', { [KOTLIN_INDENTATION]: indentSize });
}

function detektChoices(root, configured) {
  const file = detektConfigOf(root, configured, 'head');
  const active =
    file === undefined
      ? undefined
      : detektWildcardActive(readFileSync(path.join(root, file), 'utf8'));
  return choicesFrom('your detekt config', {
    [KOTLIN_WILDCARD_IMPORTS]: DETEKT_WILDCARD_CHOICES[active],
  });
}

function unusedFor(formatter) {
  return {
    ...(formatter === 'ktlint'
      ? {}
      : {
          [KOTLIN_TRAILING_COMMAS]:
            formatter === 'ktfmt' ? 'ktfmt always adds trailing commas' : NO_FORMATTER,
        }),
    ...(formatter === 'none' ? { [KOTLIN_INDENTATION]: NO_FORMATTER } : {}),
  };
}

function projectWins(tools, tool) {
  const layers = precedenceLayers(tools[tool]?.precedence);
  return layers.usesProject && !layers.nitpickerFirst;
}

export function kotlinStyle({ config, projectRoot }) {
  const tools = config.tools ?? {};
  const configured = config.kotlin?.detektConfig;
  const formatter = kotlinFormatterOf(projectRoot, config.kotlin?.formatter);
  const detektListed =
    projectWins(tools, 'detekt') || (configured !== undefined && tools.detekt === undefined);
  return {
    unused: unusedFor(formatter),
    project: {
      ...(detektListed ? detektChoices(projectRoot, configured) : {}),
      ...(formatter === 'ktfmt' && projectWins(tools, 'ktfmt') ? ktfmtChoices(projectRoot) : {}),
      ...(formatter === 'ktlint' && projectWins(tools, 'ktlint') ? ktlintChoices(projectRoot) : {}),
    },
    note: () => undefined,
  };
}
