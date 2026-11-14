import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyFindingPolicy } from '../../../shared/findings/finding-policy.mjs';
import { readHeadPolicyFile } from '../../../shared/head-policy.mjs';
import { parseRunnerArguments } from '../../../core/tooling/runner-arguments.mjs';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../core/tooling/temporary-files.mjs';
import { precedenceToolNames } from '../../java/adapters/gradle-presets.mjs';
import { GO_ANALYZER_NAME, GO_MUTATION_ANALYZER_NAME } from './go-analyzer.mjs';
import { readMutationFindings } from './mutation/go-mutation.mjs';
import { goRouteRule, readGoFindings } from './go-findings.mjs';
import { createGoContext, runGoSteps } from './go-steps.mjs';
import { describeError } from '../../../shared/messages/error-chain.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../shared/messages/troubleshooting.mjs';

export const GO_ANALYZER_COMMAND = 'go-analyzer';
const GO_OPTIONS = ['--go-settings', '--part', '--baseline-moves-file'];
const PARTS = [GO_ANALYZER_NAME, GO_MUTATION_ANALYZER_NAME];

function toolError({ rule, message }) {
  return {
    tool: GO_ANALYZER_NAME,
    rule,
    path: '.',
    identity: rule,
    message,
    classification: 'tool-error',
  };
}

function withReportRoot(step) {
  const reportRoot = trackTemporaryPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-go-')));
  try {
    return step(reportRoot);
  } finally {
    rmSync(reportRoot, { recursive: true, force: true });
    untrackTemporaryPath(reportRoot);
  }
}

const FIX_ANCHORS = new Map([
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

function fixAnchor(rule) {
  return FIX_ANCHORS.get(rule);
}

function partToolError(failure, part) {
  const error = toolError(failure);
  return {
    ...error,
    tool: part,
    message: withTroubleshooting(error.message, fixAnchor(error.rule)),
  };
}

function partFindings(context, part, policy) {
  return part === GO_MUTATION_ANALYZER_NAME
    ? readMutationFindings(context)
    : readGoFindings(context, policy);
}

export function analyzeGoSnapshot({
  projectRoot,
  settings = {},
  policy = {},
  spawn,
  environment,
  part = GO_ANALYZER_NAME,
}) {
  try {
    return {
      findings: withReportRoot((reportRoot) => {
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
            rule: error.rule ?? 'go-failed',
            message: error instanceof Error ? error.message : String(error),
          },
          part,
        ),
      ],
    };
  }
}

export function parseGoArguments(runnerArguments) {
  const own = new Map();
  const shared = [];
  const remaining = runnerArguments.values();
  for (const argument of remaining) {
    if (GO_OPTIONS.includes(argument)) {
      own.set(argument, remaining.next().value);
    } else {
      shared.push(argument);
    }
  }
  const { projectRoot, policy } = parseRunnerArguments(shared, {
    runner: `nitpicker ${GO_ANALYZER_COMMAND}`,
    precedenceTools: precedenceToolNames(),
  });
  const part = own.get('--part') ?? GO_ANALYZER_NAME;
  if (!PARTS.includes(part)) {
    throw new Error(`--part must be one of: ${PARTS.join(', ')}`);
  }
  return {
    projectRoot,
    settings: JSON.parse(own.get('--go-settings') ?? '{}'),
    policy: { ...policy, baselineMovesFile: own.get('--baseline-moves-file') },
    part,
  };
}

export function runGo(runnerArguments, { spawn, environment } = {}) {
  const { projectRoot, settings, policy, part } = parseGoArguments(runnerArguments);
  const { conventions, layout, testConsole, protocols } = readHeadPolicyFile(environment);
  return analyzeGoSnapshot({
    projectRoot: realpathSync(projectRoot),
    settings,
    policy: { ...policy, conventions, layout, testConsole, protocols },
    spawn,
    environment,
    part,
  });
}

export function runGoCli({ commandArguments, stdout, stderr, environment }) {
  try {
    stdout.write(`${JSON.stringify(runGo(commandArguments, { environment }))}\n`);
    return 0;
  } catch (error) {
    stderr.write(`Go analyzer failed: ${describeError(error)}\n`);
    return 2;
  }
}
