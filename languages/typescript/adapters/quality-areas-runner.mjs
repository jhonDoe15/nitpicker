import { QUALITY_AREA_RUNNERS } from './quality-areas/registry.mjs';
import { readLayout } from '../preset/head-policy.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { parseArguments } from './quality-areas/arguments.mjs';
import { applyAreaExceptions } from './exceptions/area-exceptions.mjs';
import { hasProjectTests } from './test-runners/test-run.mjs';
import { typescriptFailureText } from './hints/tool-failure-hint.mjs';

export async function runQualityArea(options) {
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
  return applyAreaExceptions(await runner(options));
}

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const findings = await runQualityArea(options);
    process.stdout.write(`${JSON.stringify({ findings })}\n`);
  } catch (error) {
    process.stderr.write(`Quality area adapter failed: ${typescriptFailureText(error)}\n`);
    process.exitCode = 2;
  }
}
