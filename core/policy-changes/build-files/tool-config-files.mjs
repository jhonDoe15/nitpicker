import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  GRADLE_PRESETS,
  PROJECT_TOOL_CONFIGS,
} from '../../../languages/java/adapters/gradle-presets.mjs';
import { resolveKotlinTools } from '../../../languages/java/adapters/kotlin/kotlin-tools.mjs';
import { PRETTIER_PROJECT_FILES } from '../../../languages/typescript/preset/head-policy.mjs';

const PACKAGE_JSON = 'package.json';
const PRETTIER_PRESETS = new Set([undefined, 'typescript', 'javascript']);

function usesProjectConfig(config, tool) {
  return (config.tools?.[tool]?.precedence ?? []).includes('project');
}

function fingerprintOf(projectRoot, file, gitBlobId) {
  const absolute = path.join(projectRoot, file);
  if (!existsSync(absolute)) {
    return undefined;
  }
  const content = readFileSync(absolute);
  if (file !== PACKAGE_JSON) {
    return gitBlobId(content);
  }
  try {
    const prettier = JSON.parse(content.toString('utf8')).prettier;
    return prettier === undefined ? undefined : gitBlobId(JSON.stringify(prettier));
  } catch {
    return gitBlobId(content);
  }
}

function fingerprints(projectRoot, files, gitBlobId) {
  return new Map(
    files.flatMap((file) => {
      const fingerprint = fingerprintOf(projectRoot, file, gitBlobId);
      return fingerprint === undefined ? [] : [[file, fingerprint]];
    }),
  );
}

function underDirectory(files, directory) {
  return files.filter((file) => file.startsWith(`${directory}/`));
}

function detektFiles(config, projectRoot) {
  try {
    const { detektConfig } = resolveKotlinTools(projectRoot, {
      detektConfig: config.kotlin?.detektConfig,
      snapshot: 'base',
    });
    return detektConfig === undefined ? [] : [detektConfig];
  } catch {
    return [];
  }
}

function candidates(tool, side) {
  const { config, root, files } = side;
  if (tool === 'detekt') {
    return config.preset === 'kotlin' ? detektFiles(config, root) : [];
  }
  if (tool === 'prettier') {
    return PRETTIER_PRESETS.has(config.preset) ? PRETTIER_PROJECT_FILES : [];
  }
  const configured = PROJECT_TOOL_CONFIGS.get(tool);
  return GRADLE_PRESETS.includes(config.preset) && configured !== undefined
    ? underDirectory(files, path.posix.dirname(configured))
    : [];
}

function isOptedIn(tool, config) {
  return tool === 'detekt' ? config.preset === 'kotlin' : usesProjectConfig(config, tool);
}

export function readToolConfigs(base, head, gitBlobId) {
  return ['pmd', 'checkstyle', 'detekt', 'prettier']
    .filter((tool) => isOptedIn(tool, base.config) && isOptedIn(tool, head.config))
    .map((tool) => ({
      tool,
      base: fingerprints(base.root, candidates(tool, base), gitBlobId),
      head: fingerprints(head.root, candidates(tool, head), gitBlobId),
    }));
}
