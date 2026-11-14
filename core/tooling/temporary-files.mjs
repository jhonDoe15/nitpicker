import { realpathSync, rmSync } from 'node:fs';
import { constants as osConstants, tmpdir } from 'node:os';

const trackedPaths = new Set();
const handledSignals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const handlerState = { installed: false };

export function realTemporaryDirectory() {
  return realpathSync.native(tmpdir());
}

export function trackTemporaryPath(filePath) {
  installHandlers();
  trackedPaths.add(filePath);
  return filePath;
}

export function untrackTemporaryPath(filePath) {
  trackedPaths.delete(filePath);
}

export function trackCleanup(cleanup) {
  trackTemporaryPath(cleanup);
  return () => {
    untrackTemporaryPath(cleanup);
  };
}

export function removeTrackedTemporaryPaths() {
  for (const entry of [...trackedPaths].reverse()) {
    trackedPaths.delete(entry);
    if (typeof entry === 'function') {
      entry();
    } else {
      rmSync(entry, { force: true, recursive: true });
    }
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
