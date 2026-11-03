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
import { GO_ANALYZER_NAME } from './go-analyzer.mjs';
import { goRouteRule, readGoFindings } from './go-findings.mjs';
import { createGoContext, runGoSteps } from './go-steps.mjs';
import { describeError } from '../../../shared/messages/error-chain.mjs';

export const GO_ANALYZER_COMMAND = 'go-analyzer';
const GO_OPTIONS = ['--go-settings'];

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

export function analyzeGoSnapshot({ projectRoot, settings = {}, policy = {}, spawn, environment }) {
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
        const failures = runGoSteps(context);
        if (failures.length > 0) {
          return failures.map((failure) => toolError(failure));
        }
        return applyFindingPolicy(readGoFindings(context, policy), {
          ...policy,
          inventoryTool: GO_ANALYZER_NAME,
          routeRule: goRouteRule,
        });
      }),
    };
  } catch (error) {
    return {
      findings: [
        toolError({
          rule: error.rule ?? 'go-failed',
          message: error instanceof Error ? error.message : String(error),
        }),
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
  return {
    projectRoot,
    settings: JSON.parse(own.get('--go-settings') ?? '{}'),
    policy,
  };
}

export function runGo(runnerArguments, { spawn, environment } = {}) {
  const { projectRoot, settings, policy } = parseGoArguments(runnerArguments);
  const conventions = readHeadPolicyFile(environment).conventions;
  return analyzeGoSnapshot({
    projectRoot: realpathSync(projectRoot),
    settings,
    policy: { ...policy, conventions },
    spawn,
    environment,
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
