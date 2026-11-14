import path from 'node:path';
import { GRADLE_PRESETS } from '../types/typed-views.mts';
import {
  DETEKT,
  ESLINT,
  GO_TOOLS,
  JSCPD,
  KOTLIN_TOOLS,
  PRETTIER,
  SCRIPT_PRESETS,
  SCRIPT_TOOL_FILES,
  STATICCHECK_CONFIG,
  TYPESCRIPT,
} from './candidates/tool-candidates.mts';
import {
  appliedJscpdConfig,
  appliedProjectConfigs,
  BUILD_DECLARED_TOOLS,
  declaredConfigFiles,
  eslintConfigFiles,
  GOLANGCI_FILES,
  hasProjectConfigChanges,
  isProjectConfigTool,
  JSCPD_PROJECT_FILE,
  kotlinStyleFiles,
  manifestSection,
  packageJsonKey,
  precedenceLayers,
  PROJECT_TOOL_CONFIGS,
  projectConfigCandidates,
  projectConfigTools,
  readEslintConfigFile,
  readImportLinterConfig,
  readRealInside,
  replacedEslintOptions,
  TESTS_TOOL,
  attempt,
} from '../types/tool-views.mts';
import type {
  Fingerprints as Prints,
  GitBlobId,
  ImportLinterConfig,
  PolicyConfig,
  ProjectSide,
  ReplacedOptions,
  ToolConfigEntry,
  ToolConfigReaders as Readers,
  ToolFileEntry,
} from '../types/policy-types.mts';
import { detektConfigOf, precedenceOf } from '../types/config-readers.mts';
import { toolConfigText } from './tool-config-text.mts';
import { appliedConfigs } from './applied-values/applied-sides.mts';
import { PYTHON_TOOLS, pythonConfigEntries } from './python-tool-configs.mts';

const PACKAGE_JSON = 'package.json';
const MANIFEST_KEYS = new Map([
  [PRETTIER, PRETTIER],
  [TESTS_TOOL, 'mocha'],
]);

function usesProjectConfig(config: PolicyConfig, tool: string): boolean {
  const layers = precedenceLayers(precedenceOf(config, tool));
  return layers.usesProject && !([TYPESCRIPT, TESTS_TOOL].includes(tool) && layers.nitpickerFirst);
}

function fingerprintOf(
  tool: string,
  { projectRoot, file }: { projectRoot: string; file: string },
  gitBlobId: GitBlobId,
): string | undefined {
  const content =
    tool === ESLINT ? readEslintConfigFile(projectRoot, file) : readRealInside(projectRoot, file);
  if (content === undefined) {
    return undefined;
  }
  const applied = tool === JSCPD ? appliedJscpdConfig(content.toString('utf8')) : undefined;
  if (applied?.kind === 'applied') {
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

function fingerprints(
  tool: string,
  { root: projectRoot, files }: { root: string; files: readonly string[] },
  gitBlobId: GitBlobId,
): Prints {
  return new Map(
    files.flatMap((file) => {
      const fingerprint = fingerprintOf(tool, { projectRoot, file }, gitBlobId);
      return fingerprint === undefined ? [] : [[file, fingerprint]];
    }),
  );
}

function rulesUnder(files: readonly string[], directory: string): string[] {
  return files.filter((file) => file.startsWith(`${directory}/`) && file.endsWith('.xml'));
}

function styleFilesOf(tool: string, side: ProjectSide): { files: string[] } {
  const { config, root } = side;
  const precedence = precedenceOf(config, tool);
  try {
    return {
      files: kotlinStyleFiles(
        {
          tools: precedence === undefined ? {} : { [tool]: { precedence } },
          kotlin: {
            formatter: tool === DETEKT ? 'none' : tool,
            detektConfig: tool === DETEKT ? detektConfigOf(config) : undefined,
          },
        },
        root,
      ),
    };
  } catch {
    return { files: [] };
  }
}

function goToolFiles(tool: string, files: readonly string[]): readonly string[] {
  return tool === 'staticcheck'
    ? files.filter((file) => path.posix.basename(file) === STATICCHECK_CONFIG)
    : GOLANGCI_FILES;
}

function kotlinFiles(tool: string, side: ProjectSide): string[] {
  return styleFilesOf(tool, side)
    .files.filter((file) => tool === DETEKT || path.basename(file) === '.editorconfig')
    .map((file) => path.relative(side.root, file));
}

function scriptCandidates(tool: string, side: ProjectSide): readonly string[] {
  const own = SCRIPT_TOOL_FILES.get(tool);
  if (own !== undefined) {
    return own(side);
  }
  return tool === ESLINT ? eslintConfigFiles(side.root) : projectConfigCandidates(tool);
}

function candidates(tool: string, side: ProjectSide): readonly string[] {
  const { config, files } = side;
  if (KOTLIN_TOOLS.includes(tool)) {
    return config.preset === 'kotlin' ? kotlinFiles(tool, side) : [];
  }
  if (GO_TOOLS.includes(tool)) {
    return config.preset === 'go' ? goToolFiles(tool, files) : [];
  }
  if (SCRIPT_TOOL_FILES.has(tool) || tool === ESLINT || isProjectConfigTool(tool)) {
    return SCRIPT_PRESETS.has(config.preset) ? scriptCandidates(tool, side) : [];
  }
  if (tool === JSCPD) {
    return [JSCPD_PROJECT_FILE];
  }
  const configured = PROJECT_TOOL_CONFIGS.get(tool);
  return GRADLE_PRESETS.includes(config.preset) && configured !== undefined
    ? rulesUnder(files, path.posix.dirname(configured))
    : [];
}

function isOptedIn(tool: string, config: PolicyConfig): boolean {
  return (
    usesProjectConfig(config, tool) || (tool === DETEKT && detektConfigOf(config) !== undefined)
  );
}

function declaredFingerprints(tool: string, side: ProjectSide, gitBlobId: GitBlobId): Prints {
  if (!GRADLE_PRESETS.includes(side.config.preset)) {
    return new Map<string, string>();
  }
  const { declarations, files } = declaredConfigFiles(tool, side);
  return new Map([
    ...[...declarations].map(([file, text]): [string, string] => [file, gitBlobId(text)]),
    ...fingerprints(tool, { root: side.root, files }, gitBlobId),
  ]);
}

function sideFingerprints(tool: string, side: ProjectSide, gitBlobId: GitBlobId): Prints {
  if (BUILD_DECLARED_TOOLS.includes(tool)) {
    return declaredFingerprints(tool, side, gitBlobId);
  }
  if (!PYTHON_TOOLS.includes(tool)) {
    return fingerprints(tool, { root: side.root, files: candidates(tool, side) }, gitBlobId);
  }
  return new Map(pythonEntries(tool, side).map(({ file, text }) => [file, gitBlobId(text)]));
}
function pythonEntries(
  tool: string,
  side: ProjectSide,
): { file: string; text: string; content: string }[] {
  return side.config.preset === 'python' ? pythonConfigEntries(tool, side.root) : [];
}

function evidenceOf(tool: string, head: ProjectSide, gitBlobId: GitBlobId): { evidence?: Prints } {
  return PYTHON_TOOLS.includes(tool)
    ? {
        evidence: new Map(
          pythonEntries(tool, head).map(({ file, content }) => [file, gitBlobId(content)]),
        ),
      }
    : {};
}

function importLinterOn(config: PolicyConfig): boolean {
  return config.preset === 'python' && config.python?.importLinter !== false;
}

function importLinterSide({ config, root }: ProjectSide): ImportLinterConfig | undefined {
  return importLinterOn(config) ? attempt(() => readImportLinterConfig(root)).value : undefined;
}

function importLinterEntries(base: ProjectSide, head: ProjectSide): ToolConfigEntry[] {
  return importLinterOn(head.config)
    ? [
        {
          tool: 'import-linter',
          importLinter: { base: importLinterSide(base), head: importLinterSide(head) },
        },
      ]
    : [];
}

function sameFingerprints(base: Prints, head: Prints): boolean {
  return (
    base.size === head.size &&
    [...base].every(([file, fingerprint]) => head.get(file) === fingerprint)
  );
}

function eslintReview(
  head: ProjectSide,
  prints: { base: Prints; head: Prints },
  replacedOptions: (config: PolicyConfig, root: string) => ReplacedOptions,
): { replacedOptions?: ReplacedOptions } {
  const layers = precedenceLayers(precedenceOf(head.config, ESLINT));
  if (layers.nitpickerFirst || sameFingerprints(prints.base, prints.head)) {
    return {};
  }
  return { replacedOptions: replacedOptions(head.config, head.root) };
}

export function readToolConfigs(
  base: ProjectSide,
  head: ProjectSide,
  readers: Readers,
): ToolConfigEntry[] {
  return [...toolEntries(base, head, readers), ...importLinterEntries(base, head)];
}

function toolEntries(
  base: ProjectSide,
  head: ProjectSide,
  { gitBlobId, replacedOptions = replacedEslintOptions }: Readers,
): ToolFileEntry[] {
  return [
    'pmd',
    'checkstyle',
    ...BUILD_DECLARED_TOOLS,
    ...KOTLIN_TOOLS,
    ...GO_TOOLS,
    ...SCRIPT_TOOL_FILES.keys(),
    JSCPD,
    ESLINT,
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
        ...appliedConfigs(tool, { base, head, baseOptedIn: isOptedIn(tool, base.config) }),
        ...(tool === ESLINT ? eslintReview(head, prints, replacedOptions) : {}),
        ...evidenceOf(tool, head, gitBlobId),
        ...(hasProjectConfigChanges(tool) && SCRIPT_PRESETS.has(head.config.preset)
          ? appliedProjectConfigs(tool, { base, head, baseOptedIn: isOptedIn(tool, base.config) })
          : {}),
      };
    });
}
