import { existsSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, optionalText } from '../../../../shared/values/readers.mts';
import { KOTLIN_LINE_LENGTH } from '../../conventions/kotlin-conventions.mts';
import {
  BUILD_FILES,
  declaredKtfmtStyle,
  detectFormatter,
  isMavenFacts,
  kotlinFilesOf,
  ktfmtStyle,
  mavenBuildFacts,
} from './style/kotlin-build-text.mts';
import { POM } from '../../maven/programs/tools-project.mts';
import { ktlintWorkspace } from './style/ktlint-workspace.mts';
import {
  isolatedWorkspace,
  mirroredWorkspace,
  projectEditorconfigs,
} from './style/editorconfig-mirror.mts';
import {
  type Conventions,
  detektConventionLayer,
  detektLayers,
  enforcedEditorconfigs,
  ktlintDefaults,
  projectEditorconfig,
} from './style/kotlin-style-files.mts';
import type {
  DetektRequest,
  DetektSettings,
  KotlinTools,
  ProjectStyle,
  Roots,
  StyleFile,
  StyleFilesConfig,
  ToolOptions,
  ToolPrecedence,
} from './typed/kotlin-tool-types.mts';
import { writeDetektLists } from './detekt/detekt-lists.mts';
import { TROUBLESHOOTING_ANCHORS } from '../../../../shared/messages/troubleshooting.mjs';
import {
  existingInside,
  missingProjectConfig,
  precedenceLayers,
  troubleshootingError,
} from './typed/kotlin-tool-views.mts';

const DETEKT_CONFIGS = ['config/detekt/detekt', 'config/detekt', 'detekt'].flatMap((base) => [
  `${base}.yml`,
  `${base}.yaml`,
]);
export function detektConfigOf(
  projectRoot: string,
  configured: string | undefined,
  snapshot: string | undefined,
): string | undefined {
  if (configured === undefined) {
    return DETEKT_CONFIGS.find((candidate) => existsSync(path.join(projectRoot, candidate)));
  }
  if (!existsSync(path.join(projectRoot, configured))) {
    if (snapshot === 'base') {
      return undefined;
    }
    throw troubleshootingError(
      `"kotlin.detektConfig" is ${configured}, which does not exist: create it, or change or remove "kotlin.detektConfig"`,
      TROUBLESHOOTING_ANCHORS.projectToolConfigMissing,
    );
  }
  return configured;
}

function layersOf(
  toolPrecedence: ToolPrecedence,
  tool: string,
): { usesProject: boolean; nitpickerFirst: boolean } {
  return precedenceLayers(toolPrecedence[tool]);
}

function projectStyle(
  chosen: string,
  configRoot: string,
  toolPrecedence: ToolPrecedence,
): ProjectStyle {
  const layers = layersOf(toolPrecedence, chosen);
  const hasEditorconfig = projectEditorconfig(configRoot) !== undefined;
  const ktfmtEditorconfig = chosen === 'ktfmt' && layers.usesProject;
  if (chosen === 'ktlint' && !layers.usesProject) {
    return {
      workspace: isolatedWorkspace(),
      editorconfigIgnored: hasEditorconfig,
      ktfmtEditorconfig,
    };
  }
  if (chosen === 'ktlint' || ktfmtEditorconfig) {
    const found =
      chosen === 'ktlint' ? ktlintWorkspace(configRoot) : projectEditorconfigs(configRoot);
    return {
      workspace: mirroredWorkspace(found),
      editorconfigFiles: found.files,
      editorconfigIgnored: false,
      ktfmtEditorconfig,
    };
  }
  return { editorconfigIgnored: chosen === 'ktfmt' && hasEditorconfig, ktfmtEditorconfig };
}

function detektLayerSettings({
  configRoot,
  detektConfig,
  snapshot,
  toolPrecedence,
}: DetektRequest): DetektSettings {
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

export function kotlinFormatterOf(
  projectRoot: string,
  configured: string | undefined,
  effectivePom?: string,
): string {
  return configured ?? detectFormatter(kotlinFilesOf(projectRoot, effectivePom));
}

export function mavenKotlinFacts(
  projectRoot: string,
  configured: string | undefined,
  effectivePom: string | undefined,
): ReturnType<typeof mavenBuildFacts> {
  return mavenBuildFacts(kotlinFilesOf(projectRoot, effectivePom), configured);
}

function declaredStyleOf({
  configRoot,
  effectivePom,
  facts,
}: {
  configRoot: string;
  effectivePom: string | undefined;
  facts: unknown;
}): string | undefined {
  return isMavenFacts(facts)
    ? optionalText(fieldOf(facts, 'ktfmtStyle'))
    : declaredKtfmtStyle(kotlinFilesOf(configRoot, effectivePom));
}

export function resolveKotlinTools(
  projectRoot: string,
  {
    formatter,
    detektConfig,
    snapshot,
    conventions = {},
    policyRoot,
    toolPrecedence = {},
    effectivePom,
    facts,
  }: ToolOptions = {},
): KotlinTools {
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

function enforcedDetektLayer(tools: KotlinTools, conventions: Conventions): string | undefined {
  return tools.detektConfig === undefined || tools.detektNitpickerFirst
    ? undefined
    : detektConventionLayer(conventions, { nitpickerFirst: false, always: true });
}

export function kotlinStyleFile(
  tools: KotlinTools,
  conventions: Conventions,
): StyleFile | undefined {
  const defaults = tools.formatter === 'ktlint' ? ktlintDefaults(conventions) : undefined;
  const detekt = detektConventionLayer(conventions, {
    nitpickerFirst: tools.detektNitpickerFirst,
    always: false,
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

function detektListsProperty(tools: KotlinTools, { projectRoot, configRoot }: Roots): string[] {
  const lists =
    tools.detektConfig === undefined
      ? undefined
      : writeDetektLists(projectRoot, path.join(configRoot, tools.detektConfig));
  return lists === undefined ? [] : [`-Pnitpicker.kotlin.detektLists=${lists}`];
}

function detektProperties(tools: KotlinTools, conventions: Conventions, roots: Roots): string[] {
  const { configRoot } = roots;
  const layers = detektLayers({
    conventionLayer: detektConventionLayer(conventions, {
      nitpickerFirst: tools.detektNitpickerFirst,
      always: false,
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
  projectRoot: string,
  options?: ToolOptions,
  tools = resolveKotlinTools(projectRoot, options),
): string[] {
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

function optedIn(toolPrecedence: ToolPrecedence, tool: string): boolean {
  return layersOf(toolPrecedence, tool).usesProject;
}

export function kotlinStyleFiles(
  { tools = {}, kotlin = {} }: StyleFilesConfig,
  policyRoot: string,
): string[] {
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
