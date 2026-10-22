import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../../../shared/glob.mjs';
import { DUPLICATES_MODE } from '../../../shared/policy.mjs';
import { RENAMED_SETTINGS, withNormalizedTree } from '../../../shared/renamed-clones/tree.mjs';
import { resolveTool } from '../tool-resolution.mjs';

export const DUPLICATES_TOOL = 'duplicates';
export const DUPLICATES_REPORT = 'duplicates.json';
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const JSCPD_TIMEOUT_MS = 10 * 60 * 1000;
const JSCPD_CONFIG = 'jscpd-config.json';
const RENAMED_CONFIG = 'jscpd-renamed-config.json';
const JSCPD_SETTINGS = { minTokens: 50, minLines: 5, threshold: 100 };

function insideReportRoot(reportRoot, ...segments) {
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

function relativeNames(report, cwd) {
  const bases = [cwd, realpathSync(cwd)].map((base) => `${base.replaceAll('\\', '/')}/`);
  function relative(name) {
    const normalized = name.replaceAll('\\', '/');
    const base = bases.find((candidate) => normalized.startsWith(candidate));
    return base === undefined ? normalized : normalized.slice(base.length);
  }
  return {
    ...report,
    duplicates: (report.duplicates ?? []).map((duplicate) => ({
      ...duplicate,
      firstFile: { ...duplicate.firstFile, name: relative(duplicate.firstFile.name) },
      secondFile: { ...duplicate.secondFile, name: relative(duplicate.secondFile.name) },
    })),
  };
}

function jscpdArguments({ jscpd, paths, config, format, output, ignore, together }) {
  return [
    jscpd,
    ...paths,
    '--config',
    config,
    '--format',
    format,
    '--mode',
    DUPLICATES_MODE,
    '--reporters',
    'json',
    '--output',
    output,
    '--silent',
    ...(ignore.length > 0 ? ['--ignore', ignore.join(',')] : []),
    ...(together ? ['--absolute'] : []),
  ];
}

function runJscpdOnce({ cwd, output, args }) {
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
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`jscpd exited with ${String(result.status)} in ${cwd}: ${detail}`);
  }
  return JSON.parse(readFileSync(path.join(output, 'jscpd-report.json'), 'utf8'));
}

function runGroups({ cwd, roots, together, settings, names, reportRoot, ...tool }) {
  const jscpd = resolveTool('jscpd', { bin: 'run-jscpd.js' }).binPath;
  const config = path.join(reportRoot, names.config);
  writeFileSync(config, JSON.stringify(settings));
  const groups = together
    ? [roots].filter((group) => group.length > 0)
    : roots.map((root) => [root]);
  return groups.map((paths, index) => {
    const output = insideReportRoot(reportRoot, names.output, String(index));
    const args = jscpdArguments({ jscpd, paths, config, output, together, ...tool });
    const report = runJscpdOnce({ cwd, output, args });
    return together
      ? { root: '.', report: relativeNames(report, cwd) }
      : { root: paths[0], report };
  });
}

export function renamedReportFile(reportFile) {
  return `renamed-${reportFile}`;
}

function runRenamedJscpd({ cwd, roots, renamed, reportFile, ignore, reportRoot, ...tool }) {
  const ignored = ignore.map((glob) => globToRegExp(glob));
  const files = renamed.files.filter((file) => !ignored.some((pattern) => pattern.test(file)));
  const runs = withNormalizedTree(
    { projectRoot: cwd, files, syntaxOf: () => renamed.syntax },
    ({ tree }) =>
      runGroups({
        ...tool,
        cwd: tree,
        roots: roots.filter((root) => existsSync(path.resolve(tree, root))),
        ignore,
        reportRoot,
        settings: RENAMED_SETTINGS,
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
  const runs = runGroups({
    cwd,
    roots,
    format,
    ignore,
    together,
    reportRoot,
    settings: JSCPD_SETTINGS,
    names: { config: JSCPD_CONFIG, output: 'jscpd' },
  });
  writeFileSync(insideReportRoot(reportRoot, reportFile), `${JSON.stringify({ runs })}\n`);
  if (renamed !== undefined) {
    runRenamedJscpd({ cwd, roots, renamed, reportFile, format, ignore, together, reportRoot });
  }
}
