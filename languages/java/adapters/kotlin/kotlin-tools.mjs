import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { precedenceLayers } from '../../../../shared/tool-precedence.mjs';
import { KOTLIN_INDENTATION } from '../../conventions/kotlin-conventions.mjs';
import {
  detektConventionLayer,
  detektLayers,
  ktlintDefaults,
  projectEditorconfig,
  workspaceEditorconfig,
} from './kotlin-style-files.mjs';

const BUILD_FILES = [
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'gradle/libs.versions.toml',
];
const DETEKT_CONFIGS = ['config/detekt/detekt', 'config/detekt', 'detekt'].flatMap((base) => [
  `${base}.yml`,
  `${base}.yaml`,
]);
const EDITORCONFIG = '.editorconfig';
const SPOTLESS_SCRIPT_BLOCK = 'kotlinGradle';
const BRACE_DELTA = { '{': 1, '}': -1 };

function readIfExists(projectRoot, relative) {
  const absolute = path.join(projectRoot, relative);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
}

function withoutComments(text) {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/(^|\s)\/\/.*$/gm, '$1');
}

function blockEnd(text, from) {
  let depth = 1;
  let index = from;
  for (const character of text.slice(from)) {
    index += 1;
    depth += BRACE_DELTA[character] ?? 0;
    if (depth === 0) {
      return index;
    }
  }
  return index;
}

function withoutBlocks(text, name) {
  const opener = new RegExp(String.raw`\b${name}\s*\{`, 'g');
  const kept = [];
  let from = 0;
  for (const match of text.matchAll(opener)) {
    if (match.index >= from) {
      kept.push(text.slice(from, match.index));
      from = blockEnd(text, match.index + match[0].length);
    }
  }
  return [...kept, text.slice(from)].join('');
}

function buildText(projectRoot) {
  return withoutBlocks(
    withoutComments(BUILD_FILES.map((file) => readIfExists(projectRoot, file)).join('\n')),
    SPOTLESS_SCRIPT_BLOCK,
  ).toLowerCase();
}

function detectFormatter({ build, editorconfig }) {
  if (build.includes('ktlint')) {
    return 'ktlint';
  }
  if (build.includes('ktfmt')) {
    return 'ktfmt';
  }
  return editorconfig.includes('ktlint_') ? 'ktlint' : 'none';
}

const NAMED_KTFMT_STYLES = [
  ['kotlinlangstyle', 'kotlinlang'],
  ['googlestyle', 'google'],
  ['metastyle', 'meta'],
];
const CONVENTION_KTFMT_STYLES = { 2: 'meta', 4: 'kotlinlang' };

function namedStyle(build) {
  return NAMED_KTFMT_STYLES.find(([call]) => build.includes(call))?.[1];
}

export function declaredKtfmtStyle(projectRoot) {
  return namedStyle(buildText(projectRoot));
}

function ktfmtStyle({ build, conventions, layers }) {
  const declared = layers.usesProject ? namedStyle(build) : undefined;
  const followed = CONVENTION_KTFMT_STYLES[conventions[KOTLIN_INDENTATION]];
  const ordered = layers.nitpickerFirst ? [followed, declared] : [declared, followed];
  return ordered.find((style) => style !== undefined) ?? 'meta';
}

export function detektConfigOf(projectRoot, configured, snapshot) {
  if (configured === undefined) {
    return DETEKT_CONFIGS.find((candidate) => existsSync(path.join(projectRoot, candidate)));
  }
  if (!existsSync(path.join(projectRoot, configured))) {
    if (snapshot === 'base') {
      return undefined;
    }
    throw new Error(`"kotlin.detektConfig" is ${configured}, which does not exist`);
  }
  return configured;
}

function layersOf(toolPrecedence, tool) {
  return precedenceLayers(toolPrecedence[tool]);
}

function requireProjectFile(tool, found, looked) {
  if (found === undefined) {
    throw new Error(`"tools.${tool}.precedence" lists "project" but ${looked} is missing`);
  }
  return found;
}

function projectStyle(chosen, configRoot, toolPrecedence) {
  const layers = layersOf(toolPrecedence, chosen);
  const text = layers.usesProject ? projectEditorconfig(configRoot) : undefined;
  if (chosen === 'ktlint' && layers.usesProject) {
    requireProjectFile('ktlint', text, EDITORCONFIG);
  }
  return { projectEditorconfig: text, ktfmtEditorconfig: chosen === 'ktfmt' && layers.usesProject };
}

function detektLayerSettings({ configRoot, detektConfig, snapshot, toolPrecedence }) {
  const layers = layersOf(toolPrecedence, 'detekt');
  if (!layers.usesProject && detektConfig === undefined) {
    return {
      detektConfig: undefined,
      detektNitpickerFirst: false,
      detektIgnored: detektConfigOf(configRoot, undefined, snapshot),
    };
  }
  const found = detektConfigOf(configRoot, detektConfig, snapshot);
  if (layers.usesProject && detektConfig === undefined) {
    requireProjectFile('detekt', found, 'its config (config/detekt/detekt.yml)');
  }
  return { detektConfig: found, detektNitpickerFirst: layers.nitpickerFirst };
}

export function kotlinFormatterOf(projectRoot, configured) {
  return (
    configured ??
    detectFormatter({
      build: buildText(projectRoot),
      editorconfig: readIfExists(projectRoot, EDITORCONFIG),
    })
  );
}

export function resolveKotlinTools(
  projectRoot,
  { formatter, detektConfig, snapshot, conventions = {}, policyRoot, toolPrecedence = {} } = {},
) {
  const configRoot = policyRoot ?? projectRoot;
  const chosen = kotlinFormatterOf(projectRoot, formatter);
  return {
    formatter: chosen,
    ktfmtStyle: ktfmtStyle({
      build: buildText(configRoot),
      conventions,
      layers: layersOf(toolPrecedence, 'ktfmt'),
    }),
    ...projectStyle(chosen, configRoot, toolPrecedence),
    ...detektLayerSettings({ configRoot, detektConfig, snapshot, toolPrecedence }),
  };
}

function encoded(name, text) {
  return `-Pnitpicker.kotlin.${name}=${encodeURIComponent(text)}`;
}

function styleProperties(tools, conventions) {
  const defaults = ktlintDefaults(conventions);
  const usesWorkspace = ['ktlint', 'ktfmt'].includes(tools.formatter);
  return [
    ...(usesWorkspace
      ? [encoded('workspaceEditorconfig', workspaceEditorconfig(tools.projectEditorconfig))]
      : []),
    ...(tools.formatter === 'ktlint' && defaults !== undefined
      ? [encoded('ktlintDefaults', defaults)]
      : []),
  ];
}

function detektProperties(tools, conventions, configRoot) {
  const conventionLayer = detektConventionLayer(conventions);
  const layers = detektLayers({
    conventionLayer,
    projectConfig: tools.detektConfig,
    nitpickerFirst: tools.detektNitpickerFirst,
  });
  return [
    ...(layers.length === 0 ? [] : [`-Pnitpicker.kotlin.detektLayers=${layers.join(',')}`]),
    ...(conventionLayer === undefined ? [] : [encoded('detektConventions', conventionLayer)]),
    ...(tools.detektConfig === undefined
      ? []
      : [`-Pnitpicker.kotlin.detektConfig=${path.join(configRoot, tools.detektConfig)}`]),
  ];
}

export function kotlinGradleArguments(projectRoot, options) {
  const tools = resolveKotlinTools(projectRoot, options);
  const conventions = options?.conventions ?? {};
  return [
    '-Pnitpicker.kotlin=true',
    `-Pnitpicker.kotlin.formatter=${tools.formatter}`,
    `-Pnitpicker.kotlin.ktfmtStyle=${tools.ktfmtStyle}`,
    ...(tools.ktfmtEditorconfig ? ['-Pnitpicker.kotlin.ktfmtEditorconfig=true'] : []),
    ...styleProperties(tools, conventions),
    ...detektProperties(tools, conventions, options?.policyRoot ?? projectRoot),
  ];
}
