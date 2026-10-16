import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveInside } from '../../../../shared/conventions/read-inside.mjs';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { KOTLIN_INDENTATION, KOTLIN_LINE_LENGTH } from '../../conventions/kotlin-conventions.mjs';
import {
  isolatedWorkspace,
  mirroredWorkspace,
  projectEditorconfigs,
} from './style/editorconfig-mirror.mjs';
import {
  detektConventionLayer,
  detektLayers,
  ktlintDefaults,
  projectEditorconfig,
} from './style/kotlin-style-files.mjs';
import { writeDetektLists } from './detekt/detekt-lists.mjs';

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
  return declared ?? CONVENTION_KTFMT_STYLES[conventions[KOTLIN_INDENTATION]] ?? 'meta';
}

export function detektConfigOf(projectRoot, configured, snapshot) {
  if (configured === undefined) {
    return DETEKT_CONFIGS.find((candidate) => existsSync(path.join(projectRoot, candidate)));
  }
  if (!existsSync(path.join(projectRoot, configured))) {
    if (snapshot === 'base') {
      return undefined;
    }
    throw new Error(
      `"kotlin.detektConfig" is ${configured}, which does not exist: create it, or change or remove "kotlin.detektConfig"`,
    );
  }
  return configured;
}

function layersOf(toolPrecedence, tool) {
  return precedenceLayers(toolPrecedence[tool]);
}

function ktlintWorkspace(configRoot) {
  const found = projectEditorconfigs(configRoot);
  if (found.editorconfigs.length === 0) {
    throw new Error(
      missingProjectConfig(
        'ktlint',
        `an .editorconfig (searched ${configRoot}, its subfolders and its parents up to the repository root)`,
      ),
    );
  }
  return found;
}

function projectStyle(chosen, configRoot, toolPrecedence) {
  const layers = layersOf(toolPrecedence, chosen);
  const hasEditorconfig = projectEditorconfig(configRoot) !== undefined;
  const ktfmtEditorconfig = chosen === 'ktfmt' && layers.usesProject;
  if (chosen === 'ktlint' && !layers.usesProject) {
    return { workspace: isolatedWorkspace(), editorconfigIgnored: hasEditorconfig };
  }
  if (chosen === 'ktlint' || ktfmtEditorconfig) {
    const found =
      chosen === 'ktlint' ? ktlintWorkspace(configRoot) : projectEditorconfigs(configRoot);
    return {
      workspace: mirroredWorkspace(found),
      editorconfigFiles: found.files,
      ktfmtEditorconfig,
    };
  }
  return { editorconfigIgnored: chosen === 'ktfmt' && hasEditorconfig, ktfmtEditorconfig };
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
  if (layers.usesProject && detektConfig === undefined && found === undefined) {
    throw new Error(
      missingProjectConfig('detekt', `a detekt config (${DETEKT_CONFIGS.join(', ')})`),
    );
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
  const build = buildText(configRoot);
  const ktfmtLayers = layersOf(toolPrecedence, 'ktfmt');
  return {
    formatter: chosen,
    ktfmtStyle: ktfmtStyle({ build, conventions, layers: ktfmtLayers }),
    ktfmtMaxWidth: chosen === 'ktfmt' ? conventions[KOTLIN_LINE_LENGTH] : undefined,
    ktfmtBuildStyleIgnored:
      chosen === 'ktfmt' && !ktfmtLayers.usesProject && namedStyle(build) !== undefined,
    ...projectStyle(chosen, configRoot, toolPrecedence),
    ...detektLayerSettings({ configRoot, detektConfig, snapshot, toolPrecedence }),
  };
}

export function kotlinStyleFile(tools, conventions) {
  const defaults = tools.formatter === 'ktlint' ? ktlintDefaults(conventions) : undefined;
  const detekt = detektConventionLayer(conventions, {
    nitpickerFirst: tools.detektNitpickerFirst,
  });
  const style = {
    ...tools.workspace,
    ...(defaults === undefined ? {} : { ktlintDefaults: defaults }),
    ...(detekt === undefined ? {} : { detektConventions: detekt }),
  };
  return Object.keys(style).length === 0 ? undefined : style;
}

function detektListsProperty(tools, { projectRoot, configRoot }) {
  const lists =
    tools.detektConfig === undefined
      ? undefined
      : writeDetektLists(projectRoot, path.join(configRoot, tools.detektConfig));
  return lists === undefined ? [] : [`-Pnitpicker.kotlin.detektLists=${lists}`];
}

function detektProperties(tools, conventions, roots) {
  const { configRoot } = roots;
  const layers = detektLayers({
    conventionLayer: detektConventionLayer(conventions, {
      nitpickerFirst: tools.detektNitpickerFirst,
    }),
    projectConfig: tools.detektConfig,
    nitpickerFirst: tools.detektNitpickerFirst,
  });
  return [
    ...(layers.length === 0 ? [] : [`-Pnitpicker.kotlin.detektLayers=${layers.join(',')}`]),
    ...(tools.detektConfig === undefined
      ? []
      : [`-Pnitpicker.kotlin.detektConfig=${path.join(configRoot, tools.detektConfig)}`]),
    ...detektListsProperty(tools, roots),
  ];
}

export function kotlinGradleArguments(
  projectRoot,
  options,
  tools = resolveKotlinTools(projectRoot, options),
) {
  const configRoot = options?.policyRoot ?? projectRoot;
  return [
    '-Pnitpicker.kotlin=true',
    `-Pnitpicker.kotlin.formatter=${tools.formatter}`,
    `-Pnitpicker.kotlin.ktfmtStyle=${tools.ktfmtStyle}`,
    ...(tools.ktfmtMaxWidth === undefined
      ? []
      : [`-Pnitpicker.kotlin.ktfmtMaxWidth=${tools.ktfmtMaxWidth}`]),
    ...(tools.ktfmtEditorconfig ? ['-Pnitpicker.kotlin.ktfmtEditorconfig=true'] : []),
    ...(options?.styleFile === undefined
      ? []
      : [`-Pnitpicker.kotlin.styleFile=${options.styleFile}`]),
    ...detektProperties(tools, options?.conventions ?? {}, { projectRoot, configRoot }),
  ];
}

function existingInside(root, files) {
  return files
    .map((file) => resolveInside(root, file))
    .filter((file) => file !== undefined && existsSync(file));
}

function optedIn(toolPrecedence, tool) {
  return layersOf(toolPrecedence, tool).usesProject;
}

export function kotlinStyleFiles({ tools = {}, kotlin = {} }, policyRoot) {
  const toolPrecedence = Object.fromEntries(
    Object.entries(tools).map(([tool, { precedence }]) => [tool, precedence]),
  );
  const formatter = kotlinFormatterOf(policyRoot, kotlin.formatter);
  const editorconfigs =
    ['ktlint', 'ktfmt'].includes(formatter) && optedIn(toolPrecedence, formatter);
  return [
    ...(editorconfigs ? projectEditorconfigs(policyRoot).files : []),
    ...(formatter === 'ktfmt' && editorconfigs ? existingInside(policyRoot, BUILD_FILES) : []),
    ...(optedIn(toolPrecedence, 'detekt') ? existingInside(policyRoot, DETEKT_CONFIGS) : []),
    ...(kotlin.detektConfig === undefined ? [] : existingInside(policyRoot, [kotlin.detektConfig])),
  ];
}
