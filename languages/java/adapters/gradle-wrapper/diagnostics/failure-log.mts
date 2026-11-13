import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  isExplainedError,
  troubleshootingLinkOf,
  withoutTroubleshooting,
} from '../../../../../shared/messages/troubleshooting.mjs';
import { textOf } from '../../../../../shared/values/readers.mts';
import type { JavaPolicy } from '../../typed/java-values.mts';

type GradleLog = { readonly file: string; readonly label: string };
type GradleOutput = { readonly stdout?: string | undefined; readonly stderr?: string | undefined };

function keepingExplained(error: unknown, wrapped: Error): Error {
  return isExplainedError(error)
    ? Object.defineProperty(wrapped, 'explained', { value: true })
    : wrapped;
}

function withLineBeforeLink(message: string, line: string): string {
  const link: unknown = troubleshootingLinkOf(message);
  return link === undefined
    ? `${message}\n${line}`
    : `${textOf(withoutTroubleshooting(message))}\n${line}\n${textOf(link)}`;
}

export const GRADLE_LOG_LINE = 'Full Gradle log: ';

export function gradleLog({
  logRoot,
  logLabel,
  preset = 'java',
  snapshot = 'head',
}: JavaPolicy = {}): GradleLog | undefined {
  if (logRoot === undefined) {
    return undefined;
  }
  const name = `${preset}-${snapshot}-gradle.log`;
  return {
    file: path.join(logRoot, name),
    label: logLabel === undefined ? path.join(logRoot, name) : `${logLabel}/${name}`,
  };
}

export function withGradleLog(
  error: Error,
  result: GradleOutput,
  log: GradleLog | undefined,
): Error {
  if (log === undefined) {
    return error;
  }
  try {
    mkdirSync(path.dirname(log.file), { recursive: true });
    writeFileSync(
      log.file,
      `=== stdout ===\n${result.stdout ?? ''}\n=== stderr ===\n${result.stderr ?? ''}`,
      { mode: 0o600 },
    );
    return keepingExplained(
      error,
      new Error(withLineBeforeLink(error.message, `${GRADLE_LOG_LINE}${log.label}`), {
        cause: error,
      }),
    );
  } catch (logError) {
    return keepingExplained(
      error,
      new AggregateError(
        [error, logError],
        withLineBeforeLink(
          error.message,
          `Could not save the Gradle log: ${logError instanceof Error ? logError.message : String(logError)}`,
        ),
        { cause: logError },
      ),
    );
  }
}
