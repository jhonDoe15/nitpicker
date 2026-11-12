import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  isExplainedError,
  troubleshootingLinkOf,
  withoutTroubleshooting,
} from '../../../../../shared/messages/troubleshooting.mjs';

function keepingExplained(error, wrapped) {
  return isExplainedError(error)
    ? Object.defineProperty(wrapped, 'explained', { value: true })
    : wrapped;
}

function withLineBeforeLink(message, line) {
  const link = troubleshootingLinkOf(message);
  return link === undefined
    ? `${message}\n${line}`
    : `${withoutTroubleshooting(message)}\n${line}\n${link}`;
}

export const GRADLE_LOG_LINE = 'Full Gradle log: ';

export function gradleLog({ logRoot, logLabel, preset = 'java', snapshot = 'head' } = {}) {
  if (logRoot === undefined) {
    return undefined;
  }
  const name = `${preset}-${snapshot}-gradle.log`;
  return {
    file: path.join(logRoot, name),
    label: logLabel === undefined ? path.join(logRoot, name) : `${logLabel}/${name}`,
  };
}

export function withGradleLog(error, result, log) {
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
        withLineBeforeLink(error.message, `Could not save the Gradle log: ${logError.message}`),
        { cause: logError },
      ),
    );
  }
}
