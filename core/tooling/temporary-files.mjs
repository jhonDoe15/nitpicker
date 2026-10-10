import { rmSync } from 'node:fs';
import { constants as osConstants } from 'node:os';

const trackedPaths = new Set();
const handledSignals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const handlerState = { installed: false };

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
  if (handlerState.installed) {
    return;
  }
  handlerState.installed = true;
  process.on('exit', removeTrackedTemporaryPaths);
  for (const signal of handledSignals) {
    process.on(signal, () => {
      removeTrackedTemporaryPaths();
      if (process.listenerCount(signal) === 1) {
        process.exit(128 + (osConstants.signals[signal] ?? 0));
      }
    });
  }
}
