import { QUALITY_AREA_RUNNERS } from './quality-areas/registry.mts';
import { readLayout } from './typed/head-policy.mts';
import type {
  AreaReport,
  AreaResult,
  QualityAreaOptions,
} from './quality-areas/typed/area-types.mts';
import { parseArguments } from './quality-areas/arguments.mts';
import {
  applyAreaExceptions,
  isInvokedModule,
  writeAdapterReport,
} from './typed/static-checks.mts';
import { hasProjectTests } from './test-runners/test-run.mjs';
import type { Finding } from './static-checks/shared.mts';

function areaResult(options: QualityAreaOptions): AreaResult | Promise<AreaResult> {
  const runner = QUALITY_AREA_RUNNERS.get(options.kind);
  if (runner === undefined) {
    throw new Error(`Unsupported quality area: ${options.kind}`);
  }
  if (options.kind !== 'policy-tests') {
    const layout = readLayout();
    const files = layout.projectCodeFiles(options.projectRoot);
    if (files.length === 0) {
      return [];
    }
    if (
      ['coupling', 'crap', 'mutation'].includes(options.kind) &&
      !files.some(layout.isSourceFile)
    ) {
      return [];
    }
    if (options.kind === 'test-runtime' && !files.some(layout.isRunnableTestFile)) {
      return [];
    }
    if (
      ['coverage', 'test-console', 'mutation'].includes(options.kind) &&
      !hasProjectTests(options, layout, files)
    ) {
      return [];
    }
  }
  return runner(options);
}

export async function runQualityAreaReport(options: QualityAreaOptions): Promise<AreaReport> {
  const result = await areaResult(options);
  return Array.isArray(result)
    ? { findings: applyAreaExceptions(result) }
    : { ...result, findings: applyAreaExceptions(result.findings) };
}

export async function runQualityArea(options: QualityAreaOptions): Promise<readonly Finding[]> {
  return (await runQualityAreaReport(options)).findings;
}

if (isInvokedModule(import.meta.url)) {
  const exitCode = await writeAdapterReport(
    'Quality area adapter failed',
    () => runQualityAreaReport(parseArguments(process.argv.slice(2))),
    process,
  );
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
