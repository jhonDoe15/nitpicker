import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evaluateDuplicates } from '../../../../shared/rules/duplicates.mjs';
import { jscpdClones } from '../../../../core/tooling/jscpd-clones.mjs';
import { DUPLICATES_MODE } from '../../../../shared/policy.mjs';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { globToRegExp } from '../../../../shared/glob.mjs';
import {
  renamedClones,
  renamedFindings,
  withoutRenamedCopies,
} from '../../../../shared/renamed-clones/findings.mjs';
import { RENAMED_SETTINGS, withNormalizedTree } from '../../../../shared/renamed-clones/tree.mjs';

export const DUPLICATES_TOOL = 'duplicates';
export const DUPLICATES_REPORT = 'duplicates.json';
export const JSCPD_IGNORE = ['**/build/**', '**/generated/**', '**/target/**', '**/out/**'];
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const JSCPD_TIMEOUT_MS = 10 * 60 * 1000;
const JSCPD_SETTINGS = { minTokens: 50, minLines: 5, threshold: 100 };

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
    '--ignore',
    ignore.join(','),
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
  return JSON.parse(readFileSync(path.resolve(output, 'jscpd-report.json'), 'utf8'));
}

function runGroups({ cwd, roots, together, settings, name, reportRoot, ...tool }) {
  const jscpd = resolveTool('jscpd', { bin: 'run-jscpd.js' }).binPath;
  const config = path.resolve(reportRoot, `${name}-config.json`);
  writeFileSync(config, JSON.stringify(settings));
  const groups = together
    ? [roots].filter((group) => group.length > 0)
    : roots.map((root) => [root]);
  return groups.map((paths, index) => {
    const output = path.resolve(reportRoot, name, String(index));
    const args = jscpdArguments({ jscpd, paths, config, output, together, ...tool });
    const report = runJscpdOnce({ cwd, output, args });
    return together
      ? { root: '.', report: relativeNames(report, cwd) }
      : { root: paths[0], report };
  });
}

function renamedReportFile(reportFile) {
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
        name: 'jscpd-renamed',
      }),
  );
  writeFileSync(
    path.resolve(reportRoot, renamedReportFile(reportFile)),
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
    name: 'jscpd',
  });
  writeFileSync(path.resolve(reportRoot, reportFile), `${JSON.stringify({ runs })}\n`);
  if (renamed !== undefined) {
    runRenamedJscpd({ cwd, roots, renamed, reportFile, format, ignore, together, reportRoot });
  }
}

export function runJavaDuplicates(
  projectRoot,
  {
    reportRoot,
    manifest,
    format = 'java',
    rootsKey = 'sourceRoots',
    reportFile = DUPLICATES_REPORT,
  },
) {
  const roots = (manifest[rootsKey] ?? []).filter((root) =>
    existsSync(path.resolve(projectRoot, root)),
  );
  runJscpd({
    cwd: projectRoot,
    roots,
    format,
    ignore: JSCPD_IGNORE,
    reportRoot,
    reportFile,
  });
}

function readRuns(reportRoot, reportFile) {
  const { runs } = JSON.parse(readFileSync(path.resolve(reportRoot, reportFile), 'utf8'));
  return runs.flatMap(({ root, report }) => jscpdClones(report, [root]));
}

function duplicateFindings(plain, { reportRoot, reportFile, projectRoot, syntax }) {
  const renamedFile = renamedReportFile(reportFile);
  const renamed =
    syntax !== undefined && existsSync(path.resolve(reportRoot, renamedFile))
      ? renamedClones(readRuns(reportRoot, renamedFile), { projectRoot, syntax })
      : [];
  return [
    ...evaluateDuplicates(withoutRenamedCopies(plain, renamed), DUPLICATES_TOOL),
    ...renamedFindings(renamed, DUPLICATES_TOOL),
  ];
}

export function readDuplicateFindings(reportRoot, reportFile = DUPLICATES_REPORT, renamed = {}) {
  return duplicateFindings(readRuns(reportRoot, reportFile), {
    reportRoot,
    reportFile,
    ...renamed,
  });
}
