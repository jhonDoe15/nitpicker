import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveInside } from '../../../../shared/conventions/read-inside.mjs';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { KOTLIN_LINE_LENGTH } from '../../conventions/kotlin-conventions.mjs';
import {
  BUILD_FILES,
  declaredKtfmtStyle,
  detectFormatter,
  isMavenFacts,
  kotlinFilesOf,
  ktfmtStyle,
  mavenBuildFacts,
  POM,
} from './style/kotlin-build-text.mjs';
import {
  isolatedWorkspace,
  mirroredWorkspace,
  projectEditorconfigs,
} from './style/editorconfig-mirror.mjs';
import {
  detektConventionLayer,
  detektLayers,
  enforcedEditorconfigs,
  ktlintDefaults,
  projectEditorconfig,
} from './style/kotlin-style-files.mjs';
import { writeDetektLists } from './detekt/detekt-lists.mjs';

const DETEKT_CONFIGS = ['config/detekt/detekt', 'config/detekt', 'detekt'].flatMap((base) => [
  `${base}.yml`,
  `${base}.yaml`,
]);
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

export function kotlinFormatterOf(projectRoot, configured, effectivePom) {
  return configured ?? detectFormatter(kotlinFilesOf(projectRoot, effectivePom));
}

export function mavenKotlinFacts(projectRoot, configured, effectivePom) {
  return mavenBuildFacts(kotlinFilesOf(projectRoot, effectivePom), configured);
}

function declaredStyleOf({ configRoot, effectivePom, facts }) {
  return isMavenFacts(facts)
    ? facts.ktfmtStyle
    : declaredKtfmtStyle(kotlinFilesOf(configRoot, effectivePom));
}

export function resolveKotlinTools(
  projectRoot,
  {
    formatter,
    detektConfig,
    snapshot,
    conventions = {},
    policyRoot,
    toolPrecedence = {},
    effectivePom,
    facts,
  } = {},
) {
  const configRoot = policyRoot ?? projectRoot;
  const chosen = kotlinFormatterOf(projectRoot, formatter, effectivePom);
  const declared = declaredStyleOf({ configRoot, effectivePom, facts });
  return {
    formatter: chosen,
    ktfmtStyle: ktfmtStyle({ declared, conventions }),
    ktfmtMaxWidth: chosen === 'ktfmt' ? conventions[KOTLIN_LINE_LENGTH] : undefined,
    ...projectStyle(chosen, configRoot, toolPrecedence),
    ...detektLayerSettings({ configRoot, detektConfig, snapshot, toolPrecedence }),
  };
}

function enforcedDetektLayer(tools, conventions) {
  return tools.detektConfig === undefined || tools.detektNitpickerFirst
    ? undefined
    : detektConventionLayer(conventions, { always: true });
}

export function kotlinStyleFile(tools, conventions) {
  const defaults = tools.formatter === 'ktlint' ? ktlintDefaults(conventions) : undefined;
  const detekt = detektConventionLayer(conventions, {
    nitpickerFirst: tools.detektNitpickerFirst,
  });
  const enforced = enforcedDetektLayer(tools, conventions);
  const workspace =
    tools.workspace === undefined || tools.editorconfigFiles === undefined
      ? tools.workspace
      : {
          ...tools.workspace,
          editorconfigs: enforcedEditorconfigs(tools.workspace, conventions),
        };
  const style = {
    ...workspace,
    ...(defaults === undefined ? {} : { ktlintDefaults: defaults }),
    ...(detekt === undefined ? {} : { detektConventions: detekt }),
    ...(enforced === undefined ? {} : { detektEnforced: enforced }),
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
    enforcedLayer: enforcedDetektLayer(tools, conventions),
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
    ...(formatter === 'ktfmt' && editorconfigs
      ? existingInside(policyRoot, [...BUILD_FILES, POM])
      : []),
    ...(optedIn(toolPrecedence, 'detekt') ? existingInside(policyRoot, DETEKT_CONFIGS) : []),
    ...(kotlin.detektConfig === undefined ? [] : existingInside(policyRoot, [kotlin.detektConfig])),
  ];
}
