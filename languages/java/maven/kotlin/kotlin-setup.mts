import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { kotlinTools } from './tools/kotlin-dependencies.mts';
import { isKotlinModule } from './kotlin-module.mts';
import { objectOf, optionalText, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import type { KotlinOptions, KotlinStyle } from '../typed/kotlin-types.mts';
import {
  type KotlinSetup,
  type KotlinSetupRequest,
  type OptionsRequest,
  type ResolvedTools,
  styleOf,
  toolsOf,
} from '../typed/kotlin-setup-views.mts';
import { writeDetektLists } from '../../adapters/kotlin/detekt/detekt-lists.mjs';
import { kotlinFormatAdvice } from '../../adapters/kotlin/style/kotlin-format-advice.mjs';
import { detektLayers } from '../../adapters/kotlin/style/kotlin-style-files.mjs';

const PSI_CLASSES = 'kotlin-psi-classes';
const LISTS_FILE = 'detekt-lists.yml';
const LAYER_FILES: Readonly<Record<string, string>> = {
  conventions: 'followed-conventions.yml',
  enforced: 'enforced-conventions.yml',
};
const NO_KOTLIN = { extraTools: [], options: undefined };

function detektSettings({
  tools,
  style,
  configRoot,
  work,
}: {
  readonly tools: ResolvedTools;
  readonly style: KotlinStyle;
  readonly configRoot: string;
  readonly work: string;
}): Pick<KotlinOptions, 'detektLayers' | 'detektLists'> {
  const projectConfig =
    tools.detektConfig === undefined ? undefined : path.join(configRoot, tools.detektConfig);
  const layerTexts = { conventions: style.detektConventions, enforced: style.detektEnforced };
  const layers = textsOf(
    callUntyped(detektLayers, {
      conventionLayer: layerTexts.conventions,
      enforcedLayer: layerTexts.enforced,
      projectConfig,
      nitpickerFirst: tools.detektNitpickerFirst,
    }),
  );
  mkdirSync(work, { recursive: true });
  const files: Record<string, string | undefined> = { project: projectConfig };
  for (const [name, text] of Object.entries(layerTexts)) {
    if (text !== undefined) {
      const file = path.join(work, textOf(LAYER_FILES[name]));
      files[name] = file;
      writeFileSync(file, text);
    }
  }
  return {
    detektLayers: layers.map((name) => textOf(files[name])),
    detektLists:
      projectConfig === undefined
        ? undefined
        : optionalText(
            callUntyped(writeDetektLists, configRoot, projectConfig, path.join(work, LISTS_FILE)),
          ),
  };
}

function resolveKotlinOptions({
  projectRoot,
  policy,
  effectivePom,
  work,
  toolchains,
}: OptionsRequest): KotlinOptions {
  const conventions = objectOf(policy.conventions) ?? {};
  const tools = toolsOf(projectRoot, {
    formatter: policy.kotlinFormatter,
    detektConfig: policy['kotlinDetektConfig'],
    snapshot: policy.snapshot,
    conventions,
    policyRoot: policy.policyRoot,
    toolPrecedence: policy['toolPrecedence'],
    effectivePom,
    facts: policy['kotlinFacts'],
  });
  const style = styleOf(tools.raw, conventions) ?? {};
  return {
    projectRoot,
    toolchains,
    spawn: toolchains.spawn,
    timeoutMs: toolchains.timeoutMs,
    psiClasses: path.join(work, PSI_CLASSES),
    formatter: tools.formatter,
    ktfmtStyle: tools.ktfmtStyle,
    ktfmtMaxWidth: tools.ktfmtMaxWidth,
    ktfmtEditorconfig: tools.ktfmtEditorconfig === true,
    style,
    advice: callUntyped(kotlinFormatAdvice, tools.raw),
    ...detektSettings({
      tools,
      style,
      configRoot: optionalText(policy.policyRoot) ?? projectRoot,
      work,
    }),
  };
}

export function kotlinSetup({
  projectRoot,
  policy,
  modules,
  effectivePom,
  work,
  pinned,
  maven,
  environment,
  spawn,
  timeoutMs,
}: KotlinSetupRequest): KotlinSetup {
  if (policy.preset !== 'kotlin') {
    return NO_KOTLIN;
  }
  if (!modules.some(isKotlinModule)) {
    throw new Error(
      'The kotlin preset needs a Maven project that applies kotlin-maven-plugin; this one does not. Use the java preset for its Java sources',
    );
  }
  const toolchains = { projectRoot, maven, environment, home: homedir(), spawn, timeoutMs };
  const options = resolveKotlinOptions({ projectRoot, policy, effectivePom, work, toolchains });
  return { options, extraTools: kotlinTools(pinned, options.formatter) };
}
