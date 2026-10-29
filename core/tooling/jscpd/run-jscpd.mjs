import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../../shared/filesystem.mjs';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { DUPLICATES_MODE } from '../../../shared/policy.mjs';
import { RENAMED_SETTINGS, withNormalizedTree } from '../../../shared/renamed-clones/tree.mjs';
import { layeredJscpdConfig, renamedJscpdSettings } from './config.mjs';
import { trackTemporaryPath, untrackTemporaryPath } from '../temporary-files.mjs';
import { resolveTool } from '../tool-resolution.mjs';
import { rootsPattern } from './skipped-folders.mjs';
import { commandTimeoutMs } from '../../../shared/analyzer-timeouts/analyzer-timeouts.mjs';

export const DUPLICATES_TOOL = 'duplicates';
export const DUPLICATES_REPORT = 'duplicates.json';
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const JSCPD_TIMEOUT_MS = 10 * 60 * 1000;
const JSCPD_CONFIG = 'jscpd-config.json';
const RENAMED_CONFIG = 'jscpd-renamed-config.json';
const JSCPD_SETTINGS = { minTokens: 50, minLines: 5, threshold: 100, mode: DUPLICATES_MODE };

export function insideReportRoot(reportRoot, ...segments) {
  const root = path.resolve(reportRoot);
  const target = path.resolve(root, ...segments);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Report path escapes ${root}: ${target}`);
  }
  return target;
}

export function jscpdVersion() {
  return resolveTool('jscpd', { bin: 'run-jscpd.js' }).version;
}

function jscpdArguments({ jscpd, paths, config, format, output, together, mode }) {
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

function runJscpdOnce({ cwd, output, args }) {
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: commandTimeoutMs(JSCPD_TIMEOUT_MS),
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`jscpd exited with ${String(result.status)} in ${cwd}: ${detail}`);
  }
  return JSON.parse(readFileSync(path.join(output, 'jscpd-report.json'), 'utf8'));
}

function runGroups({ cwd, roots, together, settings, ignore, names, reportRoot, ...tool }) {
  const jscpd = resolveTool('jscpd', { bin: 'run-jscpd.js' }).binPath;
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

export function renamedReportFile(reportFile) {
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
}) {
  const ignored = ignore.map((glob) => globMatcher(glob));
  const files = renamed.files.filter((file) => !ignored.some((pattern) => pattern.test(file)));
  const runs = withNormalizedTree(
    {
      projectRoot: cwd,
      files,
      syntaxOf: () => renamed.syntax,
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
  together = false,
  renamed,
}) {
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
