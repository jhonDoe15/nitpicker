import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SpawnSyncReturns } from 'node:child_process';
import { pathInside as untypedPathInside } from '../../../shared/filesystem.mjs';
import { globMatcher as untypedGlobMatcher } from '../../../shared/paths/glob.mjs';
import { DUPLICATES_MODE } from '../../../shared/policy.mjs';
import {
  RENAMED_SETTINGS,
  withNormalizedTree as untypedWithNormalizedTree,
} from '../../../shared/renamed-clones/tree.mjs';
import { parseJson } from '../../../shared/values/readers.mts';
import { layeredJscpdConfig, renamedJscpdSettings } from './config.mts';
import type { JscpdSettings } from './config.mts';
import { trackTemporaryPath, untrackTemporaryPath } from '../temporary-files.mts';
import { resolveTool } from '../tool-resolution.mts';
import { rootsPattern } from './skipped-folders.mts';
import { describeProcessEnd as untypedDescribeProcessEnd } from '../../../shared/processes/process-failure.mjs';

type RenamedInput = { readonly syntax: string; readonly files: readonly string[] };
type Run = { readonly root: string | undefined; readonly report: unknown };
type ToolOptions = { readonly format: string; readonly together: boolean };
type GroupOptions = ToolOptions & {
  readonly cwd: string;
  readonly roots: readonly string[];
  readonly settings: JscpdSettings;
  readonly ignore: readonly string[];
  readonly names: { readonly config: string; readonly output: string };
  readonly reportRoot: string;
};

const pathInside: (root: string, relative: string) => string | undefined = untypedPathInside;
const globMatcher: (glob: string) => RegExp = untypedGlobMatcher;
const describeProcessEnd: (
  name: string,
  result: SpawnSyncReturns<string>,
  options: { where: string; detail?: string },
) => string = untypedDescribeProcessEnd;
const withNormalizedTree: (
  options: {
    readonly projectRoot: string;
    readonly files: readonly string[];
    readonly syntaxOf: () => string;
    readonly typescript: undefined;
    readonly scratchRoot: string;
    readonly temporaryPaths: {
      readonly track: (path: string) => string;
      readonly untrack: (path: string) => void;
    };
  },
  run: (tree: { readonly tree: string }) => Run[],
) => Run[] = untypedWithNormalizedTree;

export const DUPLICATES_TOOL = 'duplicates';
export const DUPLICATES_REPORT = 'duplicates.json';
const TOOL = 'jscpd';
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const JSCPD_TIMEOUT_MS = 10 * 60 * 1000;
const JSCPD_CONFIG = 'jscpd-config.json';
const RENAMED_CONFIG = 'jscpd-renamed-config.json';
const JSCPD_SETTINGS = { minTokens: 50, minLines: 5, threshold: 100, mode: DUPLICATES_MODE };

export function insideReportRoot(reportRoot: string, ...segments: string[]): string {
  const root = path.resolve(reportRoot);
  const target = path.resolve(root, ...segments);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Report path escapes ${root}: ${target}`);
  }
  return target;
}

export function jscpdVersion(): string {
  return resolveTool(TOOL, { bin: 'run-jscpd.js' }).version;
}

function jscpdArguments({
  jscpd,
  paths,
  config,
  format,
  output,
  together,
  mode,
}: ToolOptions & {
  readonly jscpd: string;
  readonly paths: readonly string[];
  readonly config: string;
  readonly output: string;
  readonly mode: string;
}): string[] {
  return [
    jscpd,
    ...(together ? ['.', '--pattern', rootsPattern(paths)] : paths),
    '--config',
    config,
    '--format',
    format,
    '--mode',
    mode,
    '--reporters',
    'json',
    '--output',
    output,
    '--silent',
  ];
}

function runJscpdOnce({
  cwd,
  output,
  args,
}: {
  readonly cwd: string;
  readonly output: string;
  readonly args: readonly string[];
}): unknown {
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: JSCPD_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(describeProcessEnd(TOOL, result, { where: cwd }));
  }
  return parseJson(readFileSync(path.join(output, 'jscpd-report.json'), 'utf8'));
}

function runGroups({
  cwd,
  roots,
  together,
  settings,
  ignore,
  names,
  reportRoot,
  ...tool
}: GroupOptions): Run[] {
  const jscpd = resolveTool(TOOL, { bin: 'run-jscpd.js' }).binPath;
  const config = insideReportRoot(reportRoot, names.config);
  const { mode = DUPLICATES_MODE, ...written } = settings;
  writeFileSync(config, JSON.stringify({ ...written, ...(ignore.length > 0 ? { ignore } : {}) }));
  const groups = together
    ? [roots].filter((group) => group.length > 0)
    : roots.map((root) => [root]);
  return groups.map((paths, index) => {
    const output = insideReportRoot(reportRoot, names.output, String(index));
    const args = jscpdArguments({ jscpd, paths, config, output, together, mode, ...tool });
    const report = runJscpdOnce({ cwd, output, args });
    return together ? { root: '.', report } : { root: paths[0], report };
  });
}

export function renamedReportFile(reportFile: string): string {
  return `renamed-${reportFile}`;
}

function runRenamedJscpd({
  cwd,
  roots,
  renamed,
  reportFile,
  ignore,
  reportRoot,
  settings,
  ...tool
}: ToolOptions & {
  readonly cwd: string;
  readonly roots: readonly string[];
  readonly renamed: RenamedInput;
  readonly reportFile: string;
  readonly ignore: readonly string[];
  readonly reportRoot: string;
  readonly settings: JscpdSettings;
}): void {
  const ignored = ignore.map((glob) => globMatcher(glob));
  const files = renamed.files.filter((file) => !ignored.some((pattern) => pattern.test(file)));
  const runs = withNormalizedTree(
    {
      projectRoot: cwd,
      files,
      syntaxOf: () => renamed.syntax,
      typescript: undefined,
      scratchRoot: reportRoot,
      temporaryPaths: { track: trackTemporaryPath, untrack: untrackTemporaryPath },
    },
    ({ tree }) =>
      runGroups({
        ...tool,
        cwd: tree,
        roots: roots.filter((root) => {
          const inTree = pathInside(tree, root);
          return inTree !== undefined && existsSync(inTree);
        }),
        ignore,
        reportRoot,
        settings: renamedJscpdSettings(settings, RENAMED_SETTINGS),
        names: { config: RENAMED_CONFIG, output: 'jscpd-renamed' },
      }),
  );
  writeFileSync(
    insideReportRoot(reportRoot, renamedReportFile(reportFile)),
    `${JSON.stringify({ runs })}\n`,
  );
}

export function runJscpd({
  cwd,
  roots,
  format,
  ignore,
  reportRoot,
  reportFile = DUPLICATES_REPORT,
  together,
  renamed,
}: ToolOptions & {
  readonly cwd: string;
  readonly roots: readonly string[];
  readonly ignore: readonly string[];
  readonly reportRoot: string;
  readonly reportFile?: string;
  readonly renamed: RenamedInput | undefined;
}): void {
  const { ignore: projectIgnore = [], ...settings } = layeredJscpdConfig(JSCPD_SETTINGS);
  const ignores = [...new Set([...ignore, ...projectIgnore])];
  const runs = runGroups({
    cwd,
    roots,
    format,
    ignore: ignores,
    together,
    reportRoot,
    settings,
    names: { config: JSCPD_CONFIG, output: 'jscpd' },
  });
  writeFileSync(insideReportRoot(reportRoot, reportFile), `${JSON.stringify({ runs })}\n`);
  if (renamed !== undefined) {
    runRenamedJscpd({
      cwd,
      roots,
      renamed,
      reportFile,
      format,
      ignore: ignores,
      together,
      reportRoot,
      settings,
    });
  }
}
