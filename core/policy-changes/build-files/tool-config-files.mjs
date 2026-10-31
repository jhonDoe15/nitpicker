import path from 'node:path';
import {
  GRADLE_PRESETS,
  PROJECT_TOOL_CONFIGS,
} from '../../../languages/java/adapters/gradle-presets.mjs';
import { readRealInside } from '../../../shared/conventions/read-inside.mjs';
import {
  JSCPD_PROJECT_FILE,
  precedenceLayers,
} from '../../../shared/conventions/tool-precedence.mjs';
import { appliedJscpdConfig } from '../../tooling/jscpd/config.mjs';
import { kotlinStyleFiles } from '../../../languages/java/adapters/kotlin/kotlin-tools.mjs';
import { PRETTIER_PROJECT_FILES } from '../../../languages/typescript/preset/head-policy.mjs';
import {
  appliedStrykerConfig,
  STRYKER_PROJECT_FILES,
} from '../../../languages/typescript/preset/project-configs/stryker-project-config.mjs';
import {
  appliedTypescriptOptions,
  projectTsconfigFiles,
} from '../../../languages/typescript/preset/project-configs/typescript/typescript-project-options.mjs';
import {
  TESTS_TOOL,
  appliedRunnerRetry,
  testRunnerProjectFiles,
} from '../../../languages/typescript/preset/project-configs/test-runner/test-runner-config.mjs';
import { resolveLayoutFor } from '../../../languages/typescript/preset/layout.mjs';
import {
  isProjectConfigTool,
  manifestSection,
  packageJsonKey,
  projectConfigCandidates,
  projectConfigTools,
} from '../../../languages/typescript/preset/project-tools/project-config-files.mjs';
import {
  appliedProjectConfigs,
  hasProjectConfigChanges,
} from '../../../languages/typescript/preset/project-tools/changes/project-config-changes.mjs';
import {
  eslintConfigFiles,
  readEslintConfigFile,
} from '../../../languages/typescript/preset/eslint-project/project-config.mjs';
import { replacedEslintOptions } from '../../../languages/typescript/adapters/lint-engine/replaced-options.mjs';
import { toolConfigText } from './tool-config-text.mjs';
import { GOLANGCI_FILES } from '../../../languages/go/adapters/formatting/go-formatters.mjs';
import { PYTHON_TOOLS, pythonConfigEntries } from './python-tool-configs.mjs';

const PACKAGE_JSON = 'package.json';
const KOTLIN_TOOLS = ['detekt', 'ktlint', 'ktfmt'];
const GO_TOOLS = ['gofumpt', 'goimports'];
const SCRIPT_PRESETS = new Set([undefined, 'typescript', 'javascript']);
const SCRIPT_TOOL_FILES = new Map([
  ['prettier', () => PRETTIER_PROJECT_FILES],
  ['stryker', () => STRYKER_PROJECT_FILES],
  ['typescript', ({ config, root }) => projectTsconfigFiles(root, resolveLayoutFor(config))],
  [TESTS_TOOL, ({ config, root }) => testRunnerProjectFiles(root, config)],
]);
const MANIFEST_KEYS = new Map([
  ['prettier', 'prettier'],
  [TESTS_TOOL, 'mocha'],
]);

function usesProjectConfig(config, tool) {
  const layers = precedenceLayers(config.tools?.[tool]?.precedence);
  return (
    layers.usesProject && !(['typescript', TESTS_TOOL].includes(tool) && layers.nitpickerFirst)
  );
}

function fingerprintOf(tool, { projectRoot, file }, gitBlobId) {
  const content =
    tool === 'eslint' ? readEslintConfigFile(projectRoot, file) : readRealInside(projectRoot, file);
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
  const key = MANIFEST_KEYS.get(tool) ?? packageJsonKey(tool);
  const section = manifestSection(content.toString('utf8'), key);
  if (section.kind !== 'json') {
    return gitBlobId(content);
  }
  return section.value === undefined ? undefined : gitBlobId(JSON.stringify(section.value));
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

function scriptCandidates(tool, side) {
  const own = SCRIPT_TOOL_FILES.get(tool);
  if (own !== undefined) {
    return own(side);
  }
  return tool === 'eslint' ? eslintConfigFiles(side.root) : projectConfigCandidates(tool);
}

function candidates(tool, side) {
  const { config, files } = side;
  if (KOTLIN_TOOLS.includes(tool)) {
    return config.preset === 'kotlin' ? kotlinFiles(tool, side) : [];
  }
  if (GO_TOOLS.includes(tool)) {
    return config.preset === 'go' ? GOLANGCI_FILES : [];
  }
  if (SCRIPT_TOOL_FILES.has(tool) || tool === 'eslint' || isProjectConfigTool(tool)) {
    return SCRIPT_PRESETS.has(config.preset) ? scriptCandidates(tool, side) : [];
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

function sideFingerprints(tool, side, gitBlobId) {
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

function jscpdSide(side, optedIn) {
  const content = optedIn ? readRealInside(side.root, JSCPD_PROJECT_FILE) : undefined;
  return content === undefined
    ? { kind: 'applied', config: {} }
    : appliedJscpdConfig(content.toString('utf8'));
}

function strykerSide(side, optedIn) {
  try {
    const { values, file } = optedIn ? appliedStrykerConfig(side.root) : { values: {} };
    return { kind: 'applied', config: values, files: file === undefined ? [] : [file] };
  } catch {
    return { kind: 'rejected' };
  }
}

function typescriptSide(side, optedIn) {
  try {
    return optedIn
      ? { kind: 'applied', ...appliedTypescriptOptions(side.root, resolveLayoutFor(side.config)) }
      : { kind: 'rejected' };
  } catch {
    return { kind: 'rejected' };
  }
}

function testsSide(side, optedIn) {
  if (!optedIn) {
    return { kind: 'rejected' };
  }
  try {
    const { values, file, files } = appliedRunnerRetry(side);
    return { kind: 'applied', config: values, file, files };
  } catch {
    return { kind: 'rejected' };
  }
}

const APPLIED_SIDES = new Map([
  ['jscpd', jscpdSide],
  ['stryker', strykerSide],
  ['typescript', typescriptSide],
  [TESTS_TOOL, testsSide],
]);

function appliedConfigs(tool, base, head) {
  const read = APPLIED_SIDES.get(tool);
  if (read === undefined) {
    return {};
  }
  const sides = [read(base, isOptedIn(tool, base.config)), read(head, true)];
  if (!sides.every(({ kind }) => kind === 'applied')) {
    return {};
  }
  return {
    applied: {
      base: sides[0].config,
      head: sides[1].config,
      file: sides[1].file,
      files: [...new Set(sides.flatMap(({ files = [] }) => files))],
    },
  };
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
    ...KOTLIN_TOOLS,
    ...GO_TOOLS,
    ...SCRIPT_TOOL_FILES.keys(),
    'jscpd',
    'eslint',
    ...PYTHON_TOOLS,
    ...projectConfigTools(),
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
        ...appliedConfigs(tool, base, head),
        ...(tool === 'eslint' ? eslintReview(head, prints, replacedOptions) : {}),
        ...evidenceOf(tool, head, gitBlobId),
        ...(hasProjectConfigChanges(tool) && SCRIPT_PRESETS.has(head.config.preset)
          ? appliedProjectConfigs(tool, { base, head, baseOptedIn: isOptedIn(tool, base.config) })
          : {}),
      };
    });
}
