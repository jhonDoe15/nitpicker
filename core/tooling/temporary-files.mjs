import { rmSync } from 'node:fs';
import { constants as osConstants } from 'node:os';

const trackedPaths = new Set();
const handledSignals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
let handlersInstalled = false;

/**
 * Registers a temporary file or link that a runner writes into the analyzed project root, so
 * that it is removed when the process exits or is interrupted, even if the runner's own
 * `finally` blocks never get to run. Call this before creating the file.
 */
export function trackTemporaryPath(filePath) {
  installHandlers();
  trackedPaths.add(filePath);
  return filePath;
}

export function untrackTemporaryPath(filePath) {
  trackedPaths.delete(filePath);
}

export function removeTrackedTemporaryPaths() {
  for (const filePath of [...trackedPaths].reverse()) {
    rmSync(filePath, { force: true, recursive: true });
    trackedPaths.delete(filePath);
  }
}

function installHandlers() {
  if (handlersInstalled) {
    return;
  }
  handlersInstalled = true;
  process.on('exit', removeTrackedTemporaryPaths);
  for (const signal of handledSignals) {
    process.on(signal, () => {
      removeTrackedTemporaryPaths();
      // Another listener owns graceful shutdown; otherwise honour the default signal action.
      if (process.listenerCount(signal) === 1) {
        process.exit(128 + (osConstants.signals[signal] ?? 0));
      }
    });
  }
}
