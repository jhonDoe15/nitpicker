import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fixSpawn, runFixCommand } from '../../../core/fix/common/fix-command.mjs';
import { toolPrecedenceOf } from '../../../core/fix/common/tool-precedence.mjs';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../core/tooling/temporary-files.mjs';
import { failure } from '../adapters/execution/python-process.mjs';
import { createToolContext } from '../adapters/python-tools.mjs';

export function withPythonFixContext({ projectRoot, config, headPolicy, executeFixCommand }, use) {
  const reportRoot = trackTemporaryPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-fix-')));
  try {
    return use(
      createToolContext({
        projectRoot,
        liveRoot: projectRoot,
        settings: config?.python ?? {},
        reportRoot,
        exclude: headPolicy.exclude ?? [],
        conventions: headPolicy.conventions ?? {},
        policyRoot: projectRoot,
        toolPrecedence: toolPrecedenceOf(headPolicy.tools),
        spawn: fixSpawn({ operation: 'python-probe', executeFixCommand }),
      }),
    );
  } finally {
    rmSync(reportRoot, { recursive: true, force: true });
    untrackTemporaryPath(reportRoot);
  }
}

export function commandRunner(context, executeFixCommand) {
  return function run({ operation, command, acceptedStatuses, input }) {
    const [tool, ...args] = command;
    const launch = context.launcher.launch(tool, args);
    return runFixCommand({
      operation,
      command: launch.command,
      args: launch.args,
      cwd: context.projectRoot,
      acceptedStatuses,
      environment: { ...launch.env, ...context.env },
      input,
      executeFixCommand,
      describe: (result) => failure({ context, command, result }).message,
    });
  };
}
