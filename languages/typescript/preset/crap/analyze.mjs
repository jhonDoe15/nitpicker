import { readFile, rm, writeFile } from 'node:fs/promises';
import { register } from 'node:module';
import path from 'node:path';
import { readLayout } from '../head-policy.mjs';

async function loadAnalyzeProject() {
  if (readLayout().javascript) {
    register('../../../javascript/preset/crap-extensions-hook.mjs', import.meta.url);
  }
  return (await import('@barney-media/crap-typescript-core')).analyzeProject;
}

const analyzeProject = await loadAnalyzeProject();

const FUNCTION_MAP_CONFLICT = 'fnmap_conflict';

export async function analyzeWithFunctionMapFallback(options) {
  const analysis = await analyzeProject(options);
  const conflicted = new Set(
    analysis.metrics
      .filter((metric) => metric.coverage.unknownReason === FUNCTION_MAP_CONFLICT)
      .map((metric) => path.resolve(options.projectRoot, metric.relativePath)),
  );
  if (conflicted.size === 0) {
    return analysis;
  }
  const coverageReport = JSON.parse(await readFile(options.coverageReportPath, 'utf8'));
  const derivedPath = `${options.coverageReportPath}.without-function-map.json`;
  const derived = Object.fromEntries(
    Object.entries(coverageReport).map(([file, coverage]) => [
      file,
      conflicted.has(path.resolve(options.projectRoot, file))
        ? { ...coverage, fnMap: {}, f: {} }
        : coverage,
    ]),
  );
  await writeFile(derivedPath, JSON.stringify(derived));
  try {
    return await analyzeProject({ ...options, coverageReportPath: derivedPath });
  } finally {
    await rm(derivedPath, { force: true });
  }
}
