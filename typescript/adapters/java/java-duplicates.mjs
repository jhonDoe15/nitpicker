import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeDuplicates } from '../diff/quality-areas-runner.mjs';
import { resolveTool } from '../tool-resolution.mjs';

// Duplicate code for the Java preset: jscpd (the package's own pinned dependency, the same tool as
// the TypeScript `duplicates` check) over each main source root with the `java` format. The
// findings are the TypeScript ones: enforceable `duplicate-clone`, descriptive
// `duplicate-clone-size` (lines, tokens). Identity is the file pair, a hash of the cloned text and
// the n-th occurrence of that pair, never a line number.

export const DUPLICATES_TOOL = 'duplicates';
export const DUPLICATES_REPORT = 'duplicates.json';
const JSCPD_IGNORE = ['**/build/**', '**/generated/**', '**/target/**', '**/out/**'];
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const JSCPD_TIMEOUT_MS = 10 * 60 * 1000;

/** The version of the jscpd that runs. */
export function jscpdVersion() {
  return resolveTool('jscpd', { bin: 'run-jscpd.js' }).version;
}

/**
 * Runs jscpd over the project's existing main source roots (from build/nitpicker/manifest.json) and
 * writes `build/nitpicker/duplicates.json`: `{ runs: [{ root, report }] }`, one jscpd JSON report
 * per root. Throws when jscpd fails, so the caller can report a tool error.
 */
export function runJavaDuplicates(projectRoot) {
  const reportRoot = path.join(projectRoot, 'build/nitpicker');
  const manifest = JSON.parse(readFileSync(path.join(reportRoot, 'manifest.json'), 'utf8'));
  const roots = (manifest.sourceRoots ?? []).filter((root) =>
    existsSync(path.join(projectRoot, root)),
  );
  const jscpd = resolveTool('jscpd', { bin: 'run-jscpd.js' }).binPath;
  const runs = roots.map((root, index) => {
    const output = path.join(reportRoot, 'jscpd', String(index));
    rmSync(output, { recursive: true, force: true });
    mkdirSync(output, { recursive: true });
    const result = spawnSync(
      process.execPath,
      [
        jscpd,
        root,
        '--format',
        'java',
        '--mode',
        'mild',
        '--reporters',
        'json',
        '--output',
        output,
        '--silent',
        '--ignore',
        JSCPD_IGNORE.join(','),
      ],
      {
        cwd: projectRoot,
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
      throw new Error(`jscpd exited with ${String(result.status)} in ${projectRoot}: ${detail}`);
    }
    const report = JSON.parse(readFileSync(path.join(output, 'jscpd-report.json'), 'utf8'));
    return { root, report };
  });
  writeFileSync(path.join(reportRoot, DUPLICATES_REPORT), `${JSON.stringify({ runs })}\n`);
}

/** Findings from `build/nitpicker/duplicates.json`; jscpd names files relative to their root. */
export function readDuplicateFindings(reportRoot) {
  const { runs } = JSON.parse(readFileSync(path.join(reportRoot, DUPLICATES_REPORT), 'utf8'));
  return runs.flatMap(({ root, report }) => normalizeDuplicates(report, DUPLICATES_TOOL, [root]));
}
