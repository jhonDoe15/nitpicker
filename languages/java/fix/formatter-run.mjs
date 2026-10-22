import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../core/tooling/temporary-files.mjs';
import { runJava } from '../maven/maven-command.mjs';

export function withWorkspace(use) {
  const directory = trackTemporaryPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-fix-')));
  try {
    return use(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    untrackTemporaryPath(directory);
  }
}

export function workspaceFile(root, relative) {
  const base = path.resolve(root);
  const full = path.resolve(base, relative);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`${relative} is outside the formatting workspace`);
  }
  return full;
}

export function writeWorkspaceFile(root, relative, content) {
  const target = workspaceFile(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

export function readWorkspaceFile(root, relative) {
  return readFileSync(workspaceFile(root, relative), 'utf8');
}

export function runFormatterJar({
  operation,
  tool,
  classpath,
  mainClass,
  jvmArgs = [],
  args,
  cwd,
  acceptedStatuses,
  executeFixCommand,
}) {
  return runJava({
    tool,
    classpath,
    mainClass,
    jvmArgs,
    args,
    cwd,
    accept: (result) => acceptedStatuses.includes(result.status),
    spawn: (command, spawnArguments, options) =>
      executeFixCommand?.({
        operation,
        command,
        args: spawnArguments,
        cwd: options.cwd,
        acceptedStatuses,
        environment: {},
        input: undefined,
      }) ?? spawnSync(command, spawnArguments, options),
  });
}
