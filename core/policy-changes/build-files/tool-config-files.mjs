import path from 'node:path';
import {
  GRADLE_PRESETS,
  PROJECT_TOOL_CONFIGS,
} from '../../../languages/java/adapters/gradle-presets.mjs';
import { readInside } from '../../../shared/conventions/read-inside.mjs';
import { JSCPD_PROJECT_FILE } from '../../../shared/conventions/tool-precedence.mjs';
import { appliedJscpdConfig } from '../../tooling/jscpd/config.mjs';
import { kotlinStyleFiles } from '../../../languages/java/adapters/kotlin/kotlin-tools.mjs';
import { PRETTIER_PROJECT_FILES } from '../../../languages/typescript/preset/head-policy.mjs';
import { toolConfigText } from './tool-config-text.mjs';
import { GOLANGCI_FILES } from '../../../languages/go/adapters/formatting/go-formatters.mjs';

const PACKAGE_JSON = 'package.json';
const KOTLIN_TOOLS = ['detekt', 'ktlint', 'ktfmt'];
const GO_TOOLS = ['gofumpt', 'goimports'];
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

function fingerprintOf(tool, { projectRoot, file }, gitBlobId) {
  const content = readInside(projectRoot, file);
  if (content === undefined) {
    return undefined;
  }
  const applied = tool === 'jscpd' ? appliedJscpdConfig(content.toString('utf8')) : {};
  if (applied.kind === 'applied') {
    return gitBlobId(JSON.stringify(applied.config));
  }
  if (file !== PACKAGE_JSON) {
    return gitBlobId(toolConfigText(tool, file, content.toString('utf8')));
  }
  const key = prettierKey(content);
  if (key.malformed === true) {
    return gitBlobId(content);
  }
  return key.prettier === undefined ? undefined : gitBlobId(JSON.stringify(key.prettier));
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
  if (GO_TOOLS.includes(tool)) {
    return config.preset === 'go' ? GOLANGCI_FILES : [];
  }
  if (tool === 'prettier') {
    return PRETTIER_PRESETS.has(config.preset) ? PRETTIER_PROJECT_FILES : [];
  }
  if (tool === 'jscpd') {
    return [JSCPD_PROJECT_FILE];
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

function appliedSide(side, optedIn) {
  if (!optedIn) {
    return { kind: 'applied', config: {} };
  }
  const content = readInside(side.root, JSCPD_PROJECT_FILE);
  return content === undefined
    ? { kind: 'applied', config: {} }
    : appliedJscpdConfig(content.toString('utf8'));
}

function appliedConfigs(base, head) {
  const sides = [appliedSide(base, isOptedIn('jscpd', base.config)), appliedSide(head, true)];
  return sides.every(({ kind }) => kind === 'applied')
    ? { applied: { base: sides[0].config, head: sides[1].config } }
    : {};
}

export function readToolConfigs(base, head, gitBlobId) {
  return ['pmd', 'checkstyle', ...KOTLIN_TOOLS, ...GO_TOOLS, 'prettier', 'jscpd']
    .filter((tool) => isOptedIn(tool, head.config))
    .map((tool) => ({
      tool,
      base: fingerprints(
        tool,
        { root: base.root, files: isOptedIn(tool, base.config) ? candidates(tool, base) : [] },
        gitBlobId,
      ),
      head: fingerprints(tool, { root: head.root, files: candidates(tool, head) }, gitBlobId),
      ...(tool === 'jscpd' ? appliedConfigs(base, head) : {}),
    }));
}
