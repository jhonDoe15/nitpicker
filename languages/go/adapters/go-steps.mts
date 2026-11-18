import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { vet } from './build/go-vet.mts';
import { deadcode } from './dead-code/go-deadcode.mts';
import { tidy } from './dead-code/go-mod-tidy.mts';
import { duplicates } from './duplicates/go-duplicates.mts';
import { readGoModule } from './execution/go-module.mts';
import { run } from './execution/go-process.mts';
import { detectFormatters } from './formatting/go-formatters.mts';
import { unformattedFiles } from './formatting/go-format.mts';
import { inspect, readInspect } from './structure/go-inspect.mts';
import { lint } from './lint/go-lint.mts';
import { goTest } from './tests/go-test.mts';
import { analyzerDeadlineMs } from '../../../shared/analyzer-timeouts/analyzer-timeouts.mjs';
import { mutate } from './mutation/go-mutation.mts';
import { fieldOf, fieldsOf, parseJson, textOf, textsOf } from '../../../shared/values/readers.mts';
import type { Environment } from '../../../shared/processes/environment.mts';
import type { GoContext, GoPolicy, GoSettings, Spawn, ToolFailure } from './go-types.mts';
import { appendAll } from '../../../shared/lists/lists.mts';

type Step = (context: GoContext) => void;

const FORMAT_REPORT = 'format.json';

export function createGoContext({
  projectRoot,
  settings = {},
  policy = {},
  reportRoot,
  spawn,
  environment,
}: {
  projectRoot: string;
  settings?: GoSettings;
  policy?: GoPolicy;
  reportRoot: string;
  spawn?: Spawn | undefined;
  environment?: Environment | undefined;
}): GoContext {
  return {
    projectRoot,
    reportRoot,
    settings,
    spawn,
    environment: environment ?? {},
    module: readGoModule(projectRoot)?.module ?? '',
    duplicateSkippedFolders: policy.duplicateSkippedFolders,
    analyzerDeadlineMs: analyzerDeadlineMs(environment ?? {}),
    snapshot: policy.snapshot ?? 'head',
    baselineRoot: policy.baselineRoot,
    baselineMovesFile: policy.baselineMovesFile,
    testSeconds: policy.testSeconds,
    exclude: policy.exclude ?? [],
    toolPrecedence: policy.toolPrecedence,
    policyRoot: policy.policyRoot ?? projectRoot,
    formatting: detectFormatters(policy.policyRoot ?? projectRoot, settings.formatters),
  };
}

function format(context: GoContext) {
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

export function readFormatReport(reportRoot: string): Readonly<Record<string, readonly string[]>> {
  const report = fieldsOf(parseJson(readFileSync(path.join(reportRoot, FORMAT_REPORT), 'utf8')));
  return Object.fromEntries(Object.entries(report).map(([name, files]) => [name, textsOf(files)]));
}

function toolchain(context: GoContext) {
  run(context, ['go', 'version'], { rule: 'go-missing' });
  const flags = run(context, ['go', 'env', 'GOFLAGS'], {
    rule: 'go-env-failed',
    env: { GOFLAGS: context.environment['GOFLAGS'] },
  });
  context.projectGoFlags = (flags.stdout ?? '').trim();
}

const STEPS: Readonly<Record<string, readonly Step[]>> = {
  go: [toolchain, inspect, format, vet, lint, goTest, duplicates, tidy, deadcode],
  mutation: [toolchain, mutate],
};
const PREREQUISITES = new Set([toolchain, inspect]);

function attempt(step: Step, context: GoContext): ToolFailure | undefined {
  try {
    step(context);
    return undefined;
  } catch (error) {
    return {
      rule: textOf(fieldOf(error, 'rule') ?? 'go-failed'),
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function runGoSteps(context: GoContext, part = 'go'): ToolFailure[] {
  const failures: ToolFailure[] = [];
  for (const step of STEPS[part] ?? []) {
    const failure = attempt(step, context);
    appendAll(failures, failure === undefined ? [] : [failure]);
    if (failure !== undefined && PREREQUISITES.has(step)) {
      break;
    }
  }
  return failures;
}
