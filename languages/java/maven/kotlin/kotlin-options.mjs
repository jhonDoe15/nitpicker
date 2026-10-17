import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { kotlinTools } from './tools/kotlin-dependencies.mjs';
import { isKotlinModule } from './kotlin-module.mjs';
import { writeDetektLists } from '../../adapters/kotlin/detekt/detekt-lists.mjs';
import { kotlinStyleFile, resolveKotlinTools } from '../../adapters/kotlin/kotlin-tools.mjs';
import { kotlinFormatAdvice } from '../../adapters/kotlin/style/kotlin-format-advice.mjs';
import {
  detektConventionLayer,
  detektLayers,
} from '../../adapters/kotlin/style/kotlin-style-files.mjs';

const LISTS_FILE = 'detekt-lists.yml';
const CONVENTIONS_FILE = 'followed-conventions.yml';
const NO_KOTLIN = { extraTools: [], options: undefined };

function detektSettings({ tools, conventions, configRoot, work }) {
  const projectConfig =
    tools.detektConfig === undefined ? undefined : path.join(configRoot, tools.detektConfig);
  const conventionLayer = detektConventionLayer(conventions, {
    nitpickerFirst: tools.detektNitpickerFirst,
  });
  const layers = detektLayers({
    conventionLayer,
    projectConfig,
    nitpickerFirst: tools.detektNitpickerFirst,
  });
  mkdirSync(work, { recursive: true });
  const conventionsFile = path.join(work, CONVENTIONS_FILE);
  if (conventionLayer !== undefined) {
    writeFileSync(conventionsFile, conventionLayer);
  }
  const files = { conventions: conventionsFile, project: projectConfig };
  return {
    detektLayers: layers.map((name) => files[name]),
    detektLists:
      projectConfig === undefined
        ? undefined
        : writeDetektLists(configRoot, projectConfig, path.join(work, LISTS_FILE)),
  };
}

function resolveKotlinOptions({ projectRoot, policy, effectivePom, work }) {
  const conventions = policy.conventions ?? {};
  const tools = resolveKotlinTools(projectRoot, {
    formatter: policy.kotlinFormatter,
    detektConfig: policy.kotlinDetektConfig,
    snapshot: policy.snapshot,
    conventions,
    policyRoot: policy.policyRoot,
    toolPrecedence: policy.toolPrecedence,
    effectivePom,
  });
  return {
    projectRoot,
    formatter: tools.formatter,
    ktfmtStyle: tools.ktfmtStyle,
    ktfmtEditorconfig: tools.ktfmtEditorconfig === true,
    style: kotlinStyleFile(tools, conventions) ?? {},
    advice: kotlinFormatAdvice(tools),
    ...detektSettings({ tools, conventions, configRoot: policy.policyRoot ?? projectRoot, work }),
  };
}

export function kotlinSetup({ projectRoot, policy, modules, effectivePom, work, pinned }) {
  if (policy.preset !== 'kotlin') {
    return NO_KOTLIN;
  }
  if (!modules.some(isKotlinModule)) {
    throw new Error(
      'The kotlin preset needs a Maven project that applies kotlin-maven-plugin; this one does not. Use the java preset for its Java sources',
    );
  }
  const options = resolveKotlinOptions({ projectRoot, policy, effectivePom, work });
  return { options, extraTools: kotlinTools(pinned, options.formatter) };
}
