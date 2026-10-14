import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyFindingPolicy } from '../../../shared/finding-policy.mjs';
import { parseRunnerArguments } from '../../../core/tooling/runner-arguments.mjs';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../core/tooling/temporary-files.mjs';
import { MUTATION_ANALYZER_NAME, PYTHON_ANALYZER_NAME } from './python-analyzer.mjs';
import { applyPythonExceptions } from './python-exceptions.mjs';
import { mutationFindings } from './python-mutation.mjs';
import { readPythonFindings } from './python-reports.mjs';
import { createToolContext, runPythonTools } from './python-tools.mjs';

const UNEXPECTED_FAILURE_RULES = {
  [PYTHON_ANALYZER_NAME]: 'python-failed',
  [MUTATION_ANALYZER_NAME]: 'mutation-failed',
};
const PYTHON_OPTIONS = ['--live-root', '--python-settings', '--part'];

function toolError({ rule, message }, part = PYTHON_ANALYZER_NAME) {
  return {
    tool: part,
    rule,
    path: '.',
    identity: rule,
    message,
    classification: 'tool-error',
  };
}

function toolContext({ projectRoot, liveRoot, settings, policy }, reportRoot) {
  return createToolContext({
    projectRoot,
    liveRoot,
    settings,
    reportRoot,
    exclude: policy?.exclude,
    duplicateSkippedFolders: policy?.duplicateSkippedFolders,
    snapshot: policy?.snapshot,
    baselineRoot: policy?.baselineRoot,
  });
}

function withReportRoot(step) {
  const reportRoot = trackTemporaryPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-')));
  try {
    return step(reportRoot);
  } finally {
    rmSync(reportRoot, { recursive: true, force: true });
    untrackTemporaryPath(reportRoot);
  }
}

function collectMutationFindings(options) {
  return withReportRoot((reportRoot) =>
    applyFindingPolicy(mutationFindings(toolContext(options, reportRoot)), {
      exclude: options.policy?.exclude,
    }),
  );
}

function collectPythonFindings({ projectRoot, liveRoot, settings, policy }) {
  return withReportRoot((reportRoot) => {
    const failures = runPythonTools(
      toolContext({ projectRoot, liveRoot, settings, policy }, reportRoot),
    );
    if (failures.length > 0) {
      return failures.map((failure) => toolError(failure));
    }
    const { findings } = readPythonFindings({
      projectRoot,
      reportRoot,
      crapLimit: policy.crapLimit,
      policy,
    });
    return applyFindingPolicy(applyPythonExceptions(findings, settings.exceptions), {
      ...policy,
      inventoryTool: PYTHON_ANALYZER_NAME,
    });
  });
}

export function analyzePythonSnapshot({ part = PYTHON_ANALYZER_NAME, ...options }) {
  try {
    return {
      findings:
        part === MUTATION_ANALYZER_NAME
          ? collectMutationFindings(options)
          : collectPythonFindings(options),
    };
  } catch (error) {
    return {
      findings: [
        toolError(
          {
            rule: error.rule ?? UNEXPECTED_FAILURE_RULES[part],
            message: error instanceof Error ? error.message : String(error),
          },
          part,
        ),
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
  const part = own.get('--part') ?? PYTHON_ANALYZER_NAME;
  if (!(part in UNEXPECTED_FAILURE_RULES)) {
    throw new Error(`--part must be one of: ${Object.keys(UNEXPECTED_FAILURE_RULES).join(', ')}`);
  }
  return {
    part,
    projectRoot,
    liveRoot: own.get('--live-root') ?? projectRoot,
    settings: JSON.parse(own.get('--python-settings') ?? '{}'),
    policy,
  };
}

function main(arguments_) {
  const { part, projectRoot, liveRoot, settings, policy } = parsePythonArguments(arguments_);
  const report = analyzePythonSnapshot({
    part,
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
