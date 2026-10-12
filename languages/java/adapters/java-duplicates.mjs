import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

export function jscpdVersion() {
  return resolveTool('jscpd', { bin: 'run-jscpd.js' }).version;
}

export function runJscpd({
  cwd,
  roots,
  format,
  ignore,
  reportRoot,
  reportFile = DUPLICATES_REPORT,
}) {
  const jscpd = resolveTool('jscpd', { bin: 'run-jscpd.js' }).binPath;
  const runs = roots.map((root, index) => {
    const output = path.join(reportRoot, `jscpd-${format}`, String(index));
    rmSync(output, { recursive: true, force: true });
    mkdirSync(output, { recursive: true });
    const result = spawnSync(
      process.execPath,
      [
        jscpd,
        root,
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
      ],
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: JSCPD_TIMEOUT_MS,
      },
    );
    if (result.error !== undefined) {
      throw result.error;
    }
    if (result.status !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
      throw new Error(`jscpd exited with ${String(result.status)} in ${cwd}: ${detail}`);
    }
    const report = JSON.parse(readFileSync(path.join(output, 'jscpd-report.json'), 'utf8'));
    return { root, report };
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
  runJscpd({ cwd: projectRoot, roots, format, ignore: JSCPD_IGNORE, reportRoot, reportFile });
}

export function readDuplicateFindings(reportRoot, reportFile = DUPLICATES_REPORT) {
  const { runs } = JSON.parse(readFileSync(path.join(reportRoot, reportFile), 'utf8'));
  return runs.flatMap(({ root, report }) =>
    evaluateDuplicates(jscpdClones(report, [root]), DUPLICATES_TOOL),
  );
}
