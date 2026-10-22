import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { kotlinTools } from './tools/kotlin-dependencies.mjs';
import { isKotlinModule } from './kotlin-module.mjs';
import { writeDetektLists } from '../../adapters/kotlin/detekt/detekt-lists.mjs';
import { kotlinStyleFile, resolveKotlinTools } from '../../adapters/kotlin/kotlin-tools.mjs';
import { kotlinFormatAdvice } from '../../adapters/kotlin/style/kotlin-format-advice.mjs';
import { detektLayers } from '../../adapters/kotlin/style/kotlin-style-files.mjs';

const PSI_CLASSES = 'kotlin-psi-classes';
const LISTS_FILE = 'detekt-lists.yml';
const LAYER_FILES = {
  conventions: 'followed-conventions.yml',
  enforced: 'enforced-conventions.yml',
};
const NO_KOTLIN = { extraTools: [], options: undefined };

function detektSettings({ tools, style, configRoot, work }) {
  const projectConfig =
    tools.detektConfig === undefined ? undefined : path.join(configRoot, tools.detektConfig);
  const layerTexts = { conventions: style.detektConventions, enforced: style.detektEnforced };
  const layers = detektLayers({
    conventionLayer: layerTexts.conventions,
    enforcedLayer: layerTexts.enforced,
    projectConfig,
    nitpickerFirst: tools.detektNitpickerFirst,
  });
  mkdirSync(work, { recursive: true });
  const files = { project: projectConfig };
  for (const [name, text] of Object.entries(layerTexts)) {
    if (text !== undefined) {
      files[name] = path.join(work, LAYER_FILES[name]);
      writeFileSync(files[name], text);
    }
  }
  return {
    detektLayers: layers.map((name) => files[name]),
    detektLists:
      projectConfig === undefined
        ? undefined
        : writeDetektLists(configRoot, projectConfig, path.join(work, LISTS_FILE)),
  };
}

function resolveKotlinOptions({ projectRoot, policy, effectivePom, work, toolchains }) {
  const conventions = policy.conventions ?? {};
  const tools = resolveKotlinTools(projectRoot, {
    formatter: policy.kotlinFormatter,
    detektConfig: policy.kotlinDetektConfig,
    snapshot: policy.snapshot,
    conventions,
    policyRoot: policy.policyRoot,
    toolPrecedence: policy.toolPrecedence,
    effectivePom,
    facts: policy.kotlinFacts,
  });
  const style = kotlinStyleFile(tools, conventions) ?? {};
  return {
    projectRoot,
    toolchains,
    psiClasses: path.join(work, PSI_CLASSES),
    formatter: tools.formatter,
    ktfmtStyle: tools.ktfmtStyle,
    ktfmtMaxWidth: tools.ktfmtMaxWidth,
    ktfmtEditorconfig: tools.ktfmtEditorconfig === true,
    style,
    advice: kotlinFormatAdvice(tools),
    ...detektSettings({ tools, style, configRoot: policy.policyRoot ?? projectRoot, work }),
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
}) {
  if (policy.preset !== 'kotlin') {
    return NO_KOTLIN;
  }
  if (!modules.some(isKotlinModule)) {
    throw new Error(
      'The kotlin preset needs a Maven project that applies kotlin-maven-plugin; this one does not. Use the java preset for its Java sources',
    );
  }
  const toolchains = { projectRoot, maven, environment, home: homedir() };
  const options = resolveKotlinOptions({ projectRoot, policy, effectivePom, work, toolchains });
  return { options, extraTools: kotlinTools(pinned, options.formatter) };
}
