import { isUtf8 } from 'node:buffer';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { containedPath } from '../../../../core/fix/common/contained-path.mjs';
import { fixSpawn } from '../../../../core/fix/common/fix-command.mjs';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../../core/tooling/temporary-files.mjs';
import { runJava } from '../../maven/maven-command.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';
import type { Tools } from '../tools/tool-classpath.mts';

export type FormatterPlan = {
  readonly label: string;
  readonly operation: string;
  readonly tools: Tools;
};
type FormatterJar = {
  readonly operation: string;
  readonly tool: string;
  readonly java?: unknown;
  readonly classpath: unknown;
  readonly mainClass: string;
  readonly jvmArgs?: readonly string[];
  readonly args: readonly string[];
  readonly cwd: string;
  readonly acceptedStatuses: readonly number[];
  readonly executeFixCommand: unknown;
};

export function withWorkspace<T>(use: (directory: string) => T): T {
  const directory = textOf(trackTemporaryPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-fix-'))));
  try {
    return use(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    untrackTemporaryPath(directory);
  }
}

export function writeWorkspaceFile(
  root: string,
  relative: string,
  content: string | Uint8Array,
): string {
  const target: string = containedPath(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

export function readWorkspaceFile(root: string, relative: string): string {
  const bytes = readFileSync(containedPath(root, relative));
  if (!isUtf8(bytes)) {
    throw new Error(`The formatter wrote ${relative} in an encoding other than UTF-8`);
  }
  return bytes.toString('utf8');
}

export function runFormatterJar({
  operation,
  tool,
  java,
  classpath,
  mainClass,
  jvmArgs = [],
  args,
  cwd,
  acceptedStatuses,
  executeFixCommand,
}: FormatterJar): unknown {
  return callUntyped(runJava, {
    ...(java === undefined ? {} : { java }),
    tool,
    classpath,
    mainClass,
    jvmArgs,
    args,
    cwd,
    accept: (result: unknown) =>
      acceptedStatuses.some((status) => fieldOf(result, 'status') === status),
    spawn: callUntyped(fixSpawn, { operation, acceptedStatuses, executeFixCommand }),
  });
}
