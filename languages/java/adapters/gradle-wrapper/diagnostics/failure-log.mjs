import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  isExplainedError,
  troubleshootingLinkOf,
  withoutTroubleshooting,
} from '../../../../../shared/messages/troubleshooting.mjs';

function keepingExplained(error, wrapped) {
  return isExplainedError(error) ? Object.assign(wrapped, { explained: true }) : wrapped;
}

function withLineBeforeLink(message, line) {
  const link = troubleshootingLinkOf(message);
  return link === undefined
    ? `${message}\n${line}`
    : `${withoutTroubleshooting(message)}\n${line}\n${link}`;
}

export function withGradleLog(error, result) {
  try {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-failure-'));
    const file = path.join(directory, 'gradle.log');
    writeFileSync(
      file,
      `=== stdout ===\n${result.stdout ?? ''}\n=== stderr ===\n${result.stderr ?? ''}`,
      {
        mode: 0o600,
      },
    );
    return keepingExplained(
      error,
      new Error(`Full Gradle log: ${file}\n${error.message}`, { cause: error }),
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
