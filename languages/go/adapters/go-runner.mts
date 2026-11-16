import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../core/tooling/temporary-files.mjs';
import { GO_ANALYZER_NAME, GO_MUTATION_ANALYZER_NAME } from './go-analyzer.mjs';
import { goRouteRule, readGoFindings } from './go-findings.mts';
import {
  applyFindingPolicy,
  createGoContext,
  describeError,
  parseSharedArguments,
  readHeadPolicyFile,
  readMutationFindings,
  runGoSteps,
} from './typed/go-run-readers.mts';
import { fieldOf, fieldsOf, parseJson, textOf } from '../../../shared/values/readers.mts';
import type { Environment } from '../../../shared/processes/environment.mts';
import type { FindingRow, GoContext, GoPolicy, Spawn, ToolFailure } from './go-types.mts';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting as untypedWithTroubleshooting,
} from '../../../shared/messages/troubleshooting.mjs';

type GoOptions = {
  projectRoot: string;
  settings?: object;
  policy?: GoPolicy;
  environment?: Environment | undefined;
  spawn?: Spawn | undefined;
  part?: string;
};

export const GO_ANALYZER_COMMAND = 'go-analyzer';
const GO_OPTIONS = ['--go-settings', '--part', '--baseline-moves-file'];
const PARTS = [GO_ANALYZER_NAME, GO_MUTATION_ANALYZER_NAME];

function toolError({ rule, message }: ToolFailure): FindingRow {
  return {
    tool: GO_ANALYZER_NAME,
    rule,
    path: '.',
    identity: rule,
    message,
    classification: 'tool-error',
  };
}

function withReportRoot<Result>(step: (reportRoot: string) => Result): Result {
  const reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-go-'));
  trackTemporaryPath(reportRoot);
  try {
    return step(reportRoot);
  } finally {
    rmSync(reportRoot, { recursive: true, force: true });
    untrackTemporaryPath(reportRoot);
  }
}

const withTroubleshooting: (message: string, anchor: string | undefined) => string =
  untypedWithTroubleshooting;

const FIX_ANCHORS: ReadonlyMap<string, string> = new Map([
  ['go-missing', TROUBLESHOOTING_ANCHORS.goMissing],
  ['go-mod-tidy-failed', TROUBLESHOOTING_ANCHORS.goModuleFails],
  ['go-list-failed', TROUBLESHOOTING_ANCHORS.goModuleFails],
  ['go-env-failed', TROUBLESHOOTING_ANCHORS.goModuleFails],
  ['go-inspect-failed', TROUBLESHOOTING_ANCHORS.goModuleFails],
  ['go-vet-failed', TROUBLESHOOTING_ANCHORS.goVetOrTestFails],
  ['go-test-failed', TROUBLESHOOTING_ANCHORS.goVetOrTestFails],
  ['go-tool-install-failed', TROUBLESHOOTING_ANCHORS.goToolBuildFails],
  ['go-lint-build-failed', TROUBLESHOOTING_ANCHORS.goToolBuildFails],
  ['go-inspect-build-failed', TROUBLESHOOTING_ANCHORS.goToolBuildFails],
]);

function partToolError(failure: ToolFailure, part: string): FindingRow {
  const error = toolError(failure);
  return {
    ...error,
    tool: part,
    message: withTroubleshooting(error.message, FIX_ANCHORS.get(error.rule)),
  };
}

function partFindings(context: GoContext, part: string, policy: GoPolicy) {
  return part === GO_MUTATION_ANALYZER_NAME
    ? readMutationFindings(context)
    : readGoFindings(context, policy);
}

export function analyzeGoSnapshot({
  projectRoot,
  settings = {},
  policy = {},
  environment,
  spawn,
  part = GO_ANALYZER_NAME,
}: GoOptions): { findings: FindingRow[] } {
  try {
    return {
      findings: withReportRoot((reportRoot: string) => {
        const context = createGoContext({
          projectRoot,
          settings,
          policy,
          reportRoot,
          spawn,
          environment,
        });
        const failures = runGoSteps(context, part);
        if (failures.length > 0) {
          return failures.map((failure) => partToolError(failure, part));
        }
        return applyFindingPolicy(partFindings(context, part, policy), {
          ...policy,
          inventoryTool: part,
          routeRule: goRouteRule,
        });
      }),
    };
  } catch (error) {
    return {
      findings: [
        partToolError(
          {
            rule:
              typeof fieldOf(error, 'rule') === 'string'
                ? textOf(fieldOf(error, 'rule'))
                : 'go-failed',
            message: error instanceof Error ? error.message : String(error),
          },
          part,
        ),
      ],
    };
  }
}

function parseGoArguments(runnerArguments: readonly string[]): {
  projectRoot: string;
  settings: object;
  policy: GoPolicy;
  part: string;
} {
  const own = new Map<string, string | undefined>();
  const shared: string[] = [];
  const remaining = runnerArguments.values();
  for (const argument of remaining) {
    if (GO_OPTIONS.includes(argument)) {
      own.set(argument, remaining.next().value);
    } else {
      shared.push(argument);
    }
  }
  const { projectRoot, policy } = parseSharedArguments(shared, `nitpicker ${GO_ANALYZER_COMMAND}`);
  const part = own.get('--part') ?? GO_ANALYZER_NAME;
  if (!PARTS.includes(part)) {
    throw new Error(`--part must be one of: ${PARTS.join(', ')}`);
  }
  return {
    projectRoot,
    settings: fieldsOf(parseJson(own.get('--go-settings') ?? '{}')),
    policy: { ...policy, baselineMovesFile: own.get('--baseline-moves-file') },
    part,
  };
}

function runGo(
  runnerArguments: readonly string[],
  { environment }: { environment?: Environment | undefined } = {},
): { findings: FindingRow[] } {
  const { projectRoot, settings, policy, part } = parseGoArguments(runnerArguments);
  const { conventions, layout, testConsole, protocols } = readHeadPolicyFile(environment);
  return analyzeGoSnapshot({
    projectRoot: realpathSync(projectRoot),
    settings,
    policy: { ...policy, conventions, layout, testConsole, protocols },
    environment,
    part,
  });
}

export function runGoCli({
  commandArguments,
  stdout,
  stderr,
  environment,
}: {
  commandArguments: readonly string[];
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
  environment: Environment | undefined;
}): number {
  try {
    stdout.write(`${JSON.stringify(runGo(commandArguments, { environment }))}\n`);
    return 0;
  } catch (error) {
    stderr.write(`Go analyzer failed: ${describeError(error)}\n`);
    return 2;
  }
}
