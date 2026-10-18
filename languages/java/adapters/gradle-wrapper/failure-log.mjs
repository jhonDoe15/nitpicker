import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
    return new Error(`Full Gradle log: ${file}\n${error.message}`, { cause: error });
  } catch (logError) {
    return new Error(`${error.message}\nCould not save the Gradle log: ${logError.message}`, {
      cause: error,
    });
  }
}
