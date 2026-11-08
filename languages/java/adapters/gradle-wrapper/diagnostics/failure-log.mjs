import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

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
    return new Error(`${error.message}\nFull Gradle log: ${log.label}`, { cause: error });
  } catch (logError) {
    return new AggregateError(
      [error, logError],
      `${error.message}\nCould not save the Gradle log: ${logError.message}`,
      { cause: logError },
    );
  }
}
