import { isUtf8 } from 'node:buffer';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { containedPath } from '../../../core/fix/common/contained-path.mjs';
import { fixSpawn } from '../../../core/fix/common/fix-command.mjs';
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

export function writeWorkspaceFile(root, relative, content) {
  const target = containedPath(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

export function readWorkspaceFile(root, relative) {
  const bytes = readFileSync(containedPath(root, relative));
  if (!isUtf8(bytes)) {
    throw new Error(`The formatter wrote ${relative} in an encoding other than UTF-8`);
  }
  return bytes.toString('utf8');
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
    spawn: fixSpawn({ operation, acceptedStatuses, executeFixCommand }),
  });
}
