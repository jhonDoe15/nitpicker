import path from 'node:path';
import {
  GRADLE_PRESETS,
  PROJECT_TOOL_CONFIGS,
} from '../../../languages/java/adapters/gradle-presets.mjs';
import { readInside } from '../../../shared/conventions/read-inside.mjs';
import { kotlinStyleFiles } from '../../../languages/java/adapters/kotlin/kotlin-tools.mjs';
import { PRETTIER_PROJECT_FILES } from '../../../languages/typescript/preset/head-policy.mjs';

const PACKAGE_JSON = 'package.json';
const KOTLIN_TOOLS = ['detekt', 'ktlint', 'ktfmt'];
const PRETTIER_PRESETS = new Set([undefined, 'typescript', 'javascript']);

function usesProjectConfig(config, tool) {
  return (config.tools?.[tool]?.precedence ?? []).includes('project');
}

function prettierKey(content) {
  try {
    return { prettier: JSON.parse(content.toString('utf8')).prettier };
  } catch {
    return { malformed: true };
  }
}

function fingerprintOf(projectRoot, file, gitBlobId) {
  const content = readInside(projectRoot, file);
  if (content === undefined) {
    return undefined;
  }
  if (file !== PACKAGE_JSON) {
    return gitBlobId(content);
  }
  const key = prettierKey(content);
  if (key.malformed === true) {
    return gitBlobId(content);
  }
  return key.prettier === undefined ? undefined : gitBlobId(JSON.stringify(key.prettier));
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

function styleFilesOf(tool, side) {
  const { config, root } = side;
  const precedence = config.tools?.[tool]?.precedence;
  try {
    return {
      files: kotlinStyleFiles(
        {
          tools: precedence === undefined ? {} : { [tool]: { precedence } },
          kotlin: {
            formatter: tool === 'detekt' ? 'none' : tool,
            detektConfig: tool === 'detekt' ? config.kotlin?.detektConfig : undefined,
          },
        },
        root,
      ),
    };
  } catch {
    return { files: [] };
  }
}

function kotlinFiles(tool, side) {
  return styleFilesOf(tool, side)
    .files.filter((file) => tool === 'detekt' || path.basename(file) === '.editorconfig')
    .map((file) => path.relative(side.root, file));
}

function candidates(tool, side) {
  const { config, files } = side;
  if (KOTLIN_TOOLS.includes(tool)) {
    return config.preset === 'kotlin' ? kotlinFiles(tool, side) : [];
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
  return (
    usesProjectConfig(config, tool) ||
    (tool === 'detekt' && config.kotlin?.detektConfig !== undefined)
  );
}

export function readToolConfigs(base, head, gitBlobId) {
  return ['pmd', 'checkstyle', ...KOTLIN_TOOLS, 'prettier']
    .filter((tool) => isOptedIn(tool, base.config) && isOptedIn(tool, head.config))
    .map((tool) => ({
      tool,
      base: fingerprints(base.root, candidates(tool, base), gitBlobId),
      head: fingerprints(head.root, candidates(tool, head), gitBlobId),
    }));
}
