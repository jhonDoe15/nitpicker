import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evaluateDuplicates } from '../../../shared/rules/duplicates.mjs';
import { jscpdClones } from '../../../core/tooling/jscpd-clones.mjs';
import { DUPLICATES_MODE } from '../../../shared/policy.mjs';
import { resolveTool } from '../../../core/tooling/tool-resolution.mjs';

export const DUPLICATES_TOOL = 'duplicates';
export const DUPLICATES_REPORT = 'duplicates.json';
const JSCPD_IGNORE = ['**/build/**', '**/generated/**', '**/target/**', '**/out/**'];
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const JSCPD_TIMEOUT_MS = 10 * 60 * 1000;
const JSCPD_CONFIG = 'jscpd-config.json';
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
  return JSON.parse(readFileSync(path.join(output, 'jscpd-report.json'), 'utf8'));
}

export function runJscpd({
  cwd,
  roots,
  format,
  ignore,
  reportRoot,
  reportFile = DUPLICATES_REPORT,
  together = false,
}) {
  const jscpd = resolveTool('jscpd', { bin: 'run-jscpd.js' }).binPath;
  const config = path.join(reportRoot, JSCPD_CONFIG);
  writeFileSync(config, JSON.stringify(JSCPD_SETTINGS));
  const groups = together
    ? [roots].filter((group) => group.length > 0)
    : roots.map((root) => [root]);
  const runs = groups.map((paths, index) => {
    const output = path.join(reportRoot, 'jscpd', String(index));
    const args = jscpdArguments({ jscpd, paths, config, format, output, ignore, together });
    const report = runJscpdOnce({ cwd, output, args });
    return together
      ? { root: '.', report: relativeNames(report, cwd) }
      : { root: paths[0], report };
  });
  writeFileSync(path.join(reportRoot, reportFile), `${JSON.stringify({ runs })}\n`);
}

export function runJavaDuplicates(
  projectRoot,
  { format = 'java', rootsKey = 'sourceRoots', reportFile = DUPLICATES_REPORT } = {},
) {
  const reportRoot = path.join(projectRoot, 'build/nitpicker');
  const manifest = JSON.parse(readFileSync(path.join(reportRoot, 'manifest.json'), 'utf8'));
  const roots = (manifest[rootsKey] ?? []).filter((root) =>
    existsSync(path.join(projectRoot, root)),
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

export function readDuplicateFindings(reportRoot, reportFile = DUPLICATES_REPORT) {
  const { runs } = JSON.parse(readFileSync(path.join(reportRoot, reportFile), 'utf8'));
  return runs.flatMap(({ root, report }) =>
    evaluateDuplicates(jscpdClones(report, [root]), DUPLICATES_TOOL),
  );
}
