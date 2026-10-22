import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { vet } from './build/go-vet.mjs';
import { run } from './execution/go-process.mjs';
import { detectFormatters } from './formatting/go-formatters.mjs';
import { unformattedFiles } from './formatting/go-format.mjs';
import { inspect, readInspect } from './structure/go-inspect.mjs';
import { goTest } from './tests/go-test.mjs';

const FORMAT_REPORT = 'format.json';

export function createGoContext({
  projectRoot,
  liveRoot,
  settings = {},
  policy = {},
  reportRoot,
  spawn,
  environment,
}) {
  return {
    projectRoot,
    liveRoot: liveRoot ?? projectRoot,
    reportRoot,
    settings,
    spawn,
    environment,
    snapshot: policy.snapshot ?? 'head',
    baselineRoot: policy.baselineRoot,
    testSeconds: policy.testSeconds,
    toolPrecedence: policy.toolPrecedence,
    formatting: detectFormatters(projectRoot, settings.formatters),
  };
}

function format(context) {
  const files = readInspect(context.reportRoot)
    .files.filter(({ generated }) => !generated)
    .map(({ path: file }) => file);
  const unformatted = Object.fromEntries(
    context.formatting.formatters.map((formatter) => [
      formatter,
      files.length === 0 ? [] : unformattedFiles(context, formatter, files),
    ]),
  );
  writeFileSync(path.join(context.reportRoot, FORMAT_REPORT), JSON.stringify(unformatted));
}

export function readFormatReport(reportRoot) {
  return JSON.parse(readFileSync(path.join(reportRoot, FORMAT_REPORT), 'utf8'));
}

function toolchain(context) {
  run(context, ['go', 'version'], { rule: 'go-missing' });
}

const STEPS = [toolchain, inspect, format, vet, goTest];
const PREREQUISITES = new Set([toolchain, inspect]);

function attempt(step, context) {
  try {
    step(context);
    return undefined;
  } catch (error) {
    return {
      rule: error.rule ?? 'go-failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function runGoSteps(context) {
  const failures = [];
  for (const step of STEPS) {
    const failure = attempt(step, context);
    failures.push(...(failure === undefined ? [] : [failure]));
    if (failure !== undefined && PREREQUISITES.has(step)) {
      break;
    }
  }
  return failures;
}
