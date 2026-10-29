import path from 'node:path';
import {
  GRADLE_PRESETS,
  PROJECT_TOOL_CONFIGS,
} from '../../../languages/java/adapters/gradle-presets.mjs';
import { readInside } from '../../../shared/conventions/read-inside.mjs';
import { kotlinStyleFiles } from '../../../languages/java/adapters/kotlin/kotlin-tools.mjs';
import { PRETTIER_PROJECT_FILES } from '../../../languages/typescript/preset/head-policy.mjs';
import {
  isProjectConfigTool,
  packageJsonKey,
  projectConfigCandidates,
  projectConfigTools,
} from '../../../languages/typescript/preset/project-tools/project-config-files.mjs';
import { toolConfigText } from './tool-config-text.mjs';

const PACKAGE_JSON = 'package.json';
const KOTLIN_TOOLS = ['detekt', 'ktlint', 'ktfmt'];
const SCRIPT_PRESETS = new Set([undefined, 'typescript', 'javascript']);

function usesProjectConfig(config, tool) {
  return (config.tools?.[tool]?.precedence ?? []).includes('project');
}

function packageKey(content, key) {
  try {
    return { section: JSON.parse(content.toString('utf8'))[key] };
  } catch {
    return { malformed: true };
  }
}

function fingerprintOf(tool, { projectRoot, file }, gitBlobId) {
  const content = readInside(projectRoot, file);
  if (content === undefined) {
    return undefined;
  }
  if (file !== PACKAGE_JSON) {
    return gitBlobId(toolConfigText(tool, file, content.toString('utf8')));
  }
  const key = packageKey(content, tool === 'prettier' ? 'prettier' : packageJsonKey(tool));
  if (key.malformed === true) {
    return gitBlobId(content);
  }
  return key.section === undefined ? undefined : gitBlobId(JSON.stringify(key.section));
}

function fingerprints(tool, { root: projectRoot, files }, gitBlobId) {
  return new Map(
    files.flatMap((file) => {
      const fingerprint = fingerprintOf(tool, { projectRoot, file }, gitBlobId);
      return fingerprint === undefined ? [] : [[file, fingerprint]];
    }),
  );
}

function rulesUnder(files, directory) {
  return files.filter((file) => file.startsWith(`${directory}/`) && file.endsWith('.xml'));
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
    return SCRIPT_PRESETS.has(config.preset) ? PRETTIER_PROJECT_FILES : [];
  }
  if (isProjectConfigTool(tool)) {
    return SCRIPT_PRESETS.has(config.preset) ? projectConfigCandidates(tool) : [];
  }
  const configured = PROJECT_TOOL_CONFIGS.get(tool);
  return GRADLE_PRESETS.includes(config.preset) && configured !== undefined
    ? rulesUnder(files, path.posix.dirname(configured))
    : [];
}

function isOptedIn(tool, config) {
  return (
    usesProjectConfig(config, tool) ||
    (tool === 'detekt' && config.kotlin?.detektConfig !== undefined)
  );
}

export function readToolConfigs(base, head, gitBlobId) {
  return ['pmd', 'checkstyle', ...KOTLIN_TOOLS, 'prettier', ...projectConfigTools()]
    .filter((tool) => isOptedIn(tool, head.config))
    .map((tool) => ({
      tool,
      base: fingerprints(
        tool,
        { root: base.root, files: isOptedIn(tool, base.config) ? candidates(tool, base) : [] },
        gitBlobId,
      ),
      head: fingerprints(tool, { root: head.root, files: candidates(tool, head) }, gitBlobId),
    }));
}
