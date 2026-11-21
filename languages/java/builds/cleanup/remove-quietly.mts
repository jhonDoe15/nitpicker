import { rmSync } from 'node:fs';
import { attempt } from '../../../../shared/values/attempt/attempt.mts';
import { messageOf } from '../../../../shared/values/readers.mts';

type WarningWriter = { readonly write: (text: string) => unknown };

const RETRIES = 3;
const RETRY_DELAY_MS = 100;

export function removeQuietly(target: string, warn?: WarningWriter): boolean {
  const removed = attempt(() => {
    rmSync(target, {
      recursive: true,
      force: true,
      maxRetries: RETRIES,
      retryDelay: RETRY_DELAY_MS,
    });
  });
  if (removed.ok) {
    return true;
  }
  attempt(() => {
    warn?.write(
      `nitpicker: could not remove temporary path ${target}: ${messageOf(removed.error)}\n`,
    );
  });
  return false;
}
