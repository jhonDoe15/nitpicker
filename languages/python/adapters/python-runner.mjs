import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyJavaPolicy } from '../../java/adapters/java-policy.mjs';
import { parseRunnerArguments } from '../../java/adapters/java-runner.mjs';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../core/tooling/temporary-files.mjs';
import { PYTHON_ANALYZER_NAME } from './python-analyzer.mjs';
import { applyPythonExceptions } from './python-exceptions.mjs';
import { readPythonFindings } from './python-reports.mjs';
import { createToolContext, runPythonTools } from './python-tools.mjs';

const UNEXPECTED_FAILURE_RULE = 'python-failed';
const PYTHON_OPTIONS = ['--live-root', '--python-settings'];

function toolError({ rule, message }) {
  return {
    tool: PYTHON_ANALYZER_NAME,
    rule,
    path: '.',
    identity: rule,
    message,
    classification: 'tool-error',
  };
}

function collectPythonFindings({ projectRoot, liveRoot, settings, policy }) {
  const reportRoot = trackTemporaryPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-')));
  try {
    const failures = runPythonTools(
      createToolContext({
        projectRoot,
        liveRoot,
        settings,
        reportRoot,
        snapshot: policy.snapshot,
        baselineRoot: policy.baselineRoot,
      }),
    );
    if (failures.length > 0) {
      return failures.map(toolError);
    }
    const { findings } = readPythonFindings({
      projectRoot,
      reportRoot,
      crapLimit: policy.crapLimit,
    });
    return applyJavaPolicy(applyPythonExceptions(findings, settings.exceptions), {
      ...policy,
      inventoryTool: PYTHON_ANALYZER_NAME,
    });
  } finally {
    rmSync(reportRoot, { recursive: true, force: true });
    untrackTemporaryPath(reportRoot);
  }
}

export function analyzePythonSnapshot(options) {
  try {
    return { findings: collectPythonFindings(options) };
  } catch (error) {
    return {
      findings: [
        toolError({
          rule: error.rule ?? UNEXPECTED_FAILURE_RULE,
          message: error instanceof Error ? error.message : String(error),
        }),
      ],
    };
  }
}

export function parsePythonArguments(arguments_) {
  const own = new Map();
  const shared = [];
  const remaining = arguments_.values();
  for (const argument of remaining) {
    if (PYTHON_OPTIONS.includes(argument)) {
      own.set(argument, remaining.next().value);
    } else {
      shared.push(argument);
    }
  }
  const { projectRoot, policy } = parseRunnerArguments(shared);
  return {
    projectRoot,
    liveRoot: own.get('--live-root') ?? projectRoot,
    settings: JSON.parse(own.get('--python-settings') ?? '{}'),
    policy,
  };
}

function main(arguments_) {
  const { projectRoot, liveRoot, settings, policy } = parsePythonArguments(arguments_);
  const report = analyzePythonSnapshot({
    projectRoot: realpathSync(projectRoot),
    liveRoot: realpathSync(liveRoot),
    settings,
    policy,
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `Python differential adapter failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}
