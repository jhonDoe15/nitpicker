import path from 'node:path';
import {
  BUILD_DECLARED_TOOLS,
  GRADLE_PRESETS,
  PROJECT_TOOL_CONFIGS,
} from '../../../languages/java/adapters/gradle-presets.mjs';
import { declaredConfigFiles } from '../../../languages/java/adapters/tool-config/declared/declared-choices.mjs';
import { readInside } from '../../../shared/conventions/read-inside.mjs';
import {
  JSCPD_PROJECT_FILE,
  precedenceLayers,
} from '../../../shared/conventions/tool-precedence.mjs';
import { appliedJscpdConfig } from '../../tooling/jscpd/config.mjs';
import { kotlinStyleFiles } from '../../../languages/java/adapters/kotlin/kotlin-tools.mjs';
import { PRETTIER_PROJECT_FILES } from '../../../languages/typescript/preset/head-policy.mjs';
import {
  eslintConfigFiles,
  readEslintConfigFile,
} from '../../../languages/typescript/preset/eslint-project/project-config.mjs';
import { replacedEslintOptions } from '../../../languages/typescript/adapters/lint-engine/replaced-options.mjs';
import { toolConfigText } from './tool-config-text.mjs';
import { PYTHON_TOOLS, pythonConfigEntries } from './python-tool-configs.mjs';

const PACKAGE_JSON = 'package.json';
const KOTLIN_TOOLS = ['detekt', 'ktlint', 'ktfmt'];
const SCRIPT_PRESETS = new Set([undefined, 'typescript', 'javascript']);

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
  const content =
    tool === 'eslint' ? readEslintConfigFile(projectRoot, file) : readInside(projectRoot, file);
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
  if (tool === 'prettier') {
    return SCRIPT_PRESETS.has(config.preset) ? PRETTIER_PROJECT_FILES : [];
  }
  if (tool === 'eslint') {
    return SCRIPT_PRESETS.has(config.preset) ? eslintConfigFiles(side.root) : [];
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

function declaredFingerprints(tool, side, gitBlobId) {
  if (!GRADLE_PRESETS.includes(side.config.preset)) {
    return new Map();
  }
  const { declarations, files } = declaredConfigFiles(tool, side);
  return new Map([
    ...[...declarations].map(([file, text]) => [file, gitBlobId(text)]),
    ...fingerprints(tool, { root: side.root, files }, gitBlobId),
  ]);
}

function sideFingerprints(tool, side, gitBlobId) {
  if (BUILD_DECLARED_TOOLS.includes(tool)) {
    return declaredFingerprints(tool, side, gitBlobId);
  }
  if (!PYTHON_TOOLS.includes(tool)) {
    return fingerprints(tool, { root: side.root, files: candidates(tool, side) }, gitBlobId);
  }
  return new Map(pythonEntries(tool, side).map(({ file, text }) => [file, gitBlobId(text)]));
}
function pythonEntries(tool, side) {
  return side.config.preset === 'python' ? pythonConfigEntries(tool, side.root) : [];
}

function evidenceOf(tool, head, gitBlobId) {
  return PYTHON_TOOLS.includes(tool)
    ? {
        evidence: new Map(
          pythonEntries(tool, head).map(({ file, content }) => [file, gitBlobId(content)]),
        ),
      }
    : {};
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

function sameFingerprints(base, head) {
  return (
    base.size === head.size &&
    [...base].every(([file, fingerprint]) => head.get(file) === fingerprint)
  );
}

function eslintReview(head, prints, replacedOptions) {
  const layers = precedenceLayers(head.config.tools?.eslint?.precedence);
  if (layers.nitpickerFirst || sameFingerprints(prints.base, prints.head)) {
    return {};
  }
  return { replacedOptions: replacedOptions(head.config, head.root) };
}

export function readToolConfigs(
  base,
  head,
  { gitBlobId, replacedOptions = replacedEslintOptions },
) {
  return [
    'pmd',
    'checkstyle',
    ...BUILD_DECLARED_TOOLS,
    ...KOTLIN_TOOLS,
    'prettier',
    'jscpd',
    'eslint',
    ...PYTHON_TOOLS,
  ]
    .filter((tool) => isOptedIn(tool, head.config))
    .map((tool) => {
      const prints = {
        base: isOptedIn(tool, base.config) ? sideFingerprints(tool, base, gitBlobId) : new Map(),
        head: sideFingerprints(tool, head, gitBlobId),
      };
      return {
        tool,
        optsIn: !isOptedIn(tool, base.config),
        ...prints,
        ...(tool === 'jscpd' ? appliedConfigs(base, head) : {}),
        ...(tool === 'eslint' ? eslintReview(head, prints, replacedOptions) : {}),
        ...evidenceOf(tool, head, gitBlobId),
      };
    });
}
