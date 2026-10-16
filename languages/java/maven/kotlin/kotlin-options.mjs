import path from 'node:path';
import { kotlinTools } from './tools/kotlin-dependencies.mjs';
import { isKotlinModule } from './kotlin-module.mjs';
import { writeDetektLists } from '../../adapters/kotlin/detekt/detekt-lists.mjs';
import { resolveKotlinTools } from '../../adapters/kotlin/kotlin-tools.mjs';

const LISTS_FILE = 'detekt-lists.yml';
const NO_KOTLIN = { extraTools: [], options: undefined };

function resolveKotlinOptions({ projectRoot, policy, effectivePom, work }) {
  const tools = resolveKotlinTools(projectRoot, {
    formatter: policy.kotlinFormatter,
    detektConfig: policy.kotlinDetektConfig,
    snapshot: policy.snapshot,
    effectivePom,
  });
  const detektConfig =
    tools.detektConfig === undefined ? undefined : path.join(projectRoot, tools.detektConfig);
  return {
    formatter: tools.formatter,
    ktfmtStyle: tools.ktfmtStyle,
    editorconfig: tools.editorconfig,
    detektConfig,
    detektLists:
      detektConfig === undefined
        ? undefined
        : writeDetektLists(projectRoot, detektConfig, path.join(work, LISTS_FILE)),
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
