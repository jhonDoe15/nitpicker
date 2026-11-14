import { detectedPreset as untypedDetectedPreset } from '../../../../core/configuration/project-checks/preset-detection.mjs';
import { projectFilePaths as untypedProjectFilePaths } from '../../../../shared/project-files/project-files.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting as untypedWithTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';
import { objectOf } from '../../../../shared/values/readers.mts';
import type { Layout } from '../../adapters/typed/head-policy.mts';
import {
  EXCLUDED_PATH_PATTERN,
  codeExtensionNames,
  resolveLayoutFor as untypedResolveLayoutFor,
} from '../layout.mjs';

const detectedPreset: (projectRoot: string) => string | undefined = untypedDetectedPreset;
const projectFilePaths: (projectRoot: string) => string[] = untypedProjectFilePaths;
const withTroubleshooting: (message: string, anchor: string) => string = untypedWithTroubleshooting;
const resolveLayoutFor: (policy: object) => Layout = untypedResolveLayoutFor;

type EmptySourcesError = {
  tool: string;
  snapshot: string;
  rule: string;
  path: string;
  message: string;
};

export const EMPTY_SOURCES_TOOL = 'source-roots';

const SCRIPT_PRESETS = new Set([undefined, 'typescript', 'javascript']);
const CODE_FILE = new RegExp(`\\.(?:${codeExtensionNames.join('|')})$`);
const TYPESCRIPT_FILE = /\.(?:ts|tsx|mts|cts)$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const TOOL_CONFIGURATION = /(?:^|\/)[^/]*\.config\.[cm]?[jt]sx?$/;
const HIDDEN_FOLDER = /(?:^|\/)\.[^/]+\//;
const EXCLUDED_FOLDER = new RegExp(EXCLUDED_PATH_PATTERN);
const PACKAGE_SOURCE = /^(.+?\/src)\//;
const LISTED_FOLDERS = 3;

function isCandidate(file: string, layout: Layout): boolean {
  return (
    CODE_FILE.test(file) &&
    !DECLARATION_FILE.test(file) &&
    !TOOL_CONFIGURATION.test(file) &&
    !HIDDEN_FOLDER.test(file) &&
    !EXCLUDED_FOLDER.test(file) &&
    !layout.isExcluded(file)
  );
}

function folderOf(file: string): string | undefined {
  const [top] = file.split('/');
  return file.includes('/') ? (PACKAGE_SOURCE.exec(file)?.[1] ?? top) : undefined;
}

function folderCounts(files: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const folder of files.map(folderOf).filter((entry) => entry !== undefined)) {
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function suggestion(files: string[]): string {
  const folders = folderCounts(files).map(([folder]) => folder);
  if (folders.length === 0) {
    return '';
  }
  const kind = files.some((file) => TYPESCRIPT_FILE.test(file)) ? 'TypeScript' : 'JavaScript';
  const more =
    folders.length > LISTED_FOLDERS ? `, and ${String(folders.length - LISTED_FOLDERS)} more` : '';
  return ` (this repository has ${kind} files under ${folders.slice(0, LISTED_FOLDERS).join(', ')}${more})`;
}

export function sourcesElsewhere(projectRoot: string, layout: Layout): string {
  return suggestion(projectFilePaths(projectRoot).filter((file) => isCandidate(file, layout)));
}

export function emptySourcesMessage(
  config: { preset?: string },
  projectRoot: string,
  headPolicy: unknown,
): string | undefined {
  if (
    !SCRIPT_PRESETS.has(config.preset) ||
    (config.preset === undefined && detectedPreset(projectRoot) !== undefined)
  ) {
    return undefined;
  }
  const layout = resolveLayoutFor(objectOf(headPolicy) ?? {});
  const roots = [...layout.sourceRoots, ...layout.testRoots];
  if (layout.projectCodeFiles(projectRoot, roots).length > 0) {
    return undefined;
  }
  const where = sourcesElsewhere(projectRoot, layout);
  const advice = where === '' ? ' to the folders that hold the code.' : `${where}.`;
  return (
    `No TypeScript or JavaScript files under ${layout.sourceRoots.join(', ')}; nothing was analyzed. ` +
    `Set "layout.sourceRoots"${advice}`
  );
}

export function emptySourcesErrors(
  config: { preset?: string },
  projectRoot: string,
  { headPolicy, analyzerNames }: { headPolicy: unknown; analyzerNames?: readonly string[] },
): EmptySourcesError[] {
  const message =
    (analyzerNames ?? []).length === 0
      ? emptySourcesMessage(config, projectRoot, headPolicy)
      : undefined;
  return message === undefined
    ? []
    : [
        {
          tool: EMPTY_SOURCES_TOOL,
          snapshot: 'head',
          rule: 'empty-sources',
          path: '',
          message: withTroubleshooting(message, TROUBLESHOOTING_ANCHORS.emptySourceRoots),
        },
      ];
}
