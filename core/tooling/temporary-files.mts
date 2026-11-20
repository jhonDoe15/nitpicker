import { realpathSync, rmSync } from 'node:fs';
import { constants as nodeConstants, tmpdir } from 'node:os';

type Tracked = string | (() => void);

const trackedPaths = new Set();
const handledSignals: readonly string[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const osConstants: { readonly signals: Readonly<Record<string, number | undefined>> } =
  nodeConstants;
const handlerState = { installed: false };

export function realTemporaryDirectory(): string {
  return realpathSync.native(tmpdir());
}

export function trackTemporaryPath<Entry extends Tracked>(filePath: Entry): Entry {
  installHandlers();
  trackedPaths.add(filePath);
  return filePath;
}

export function untrackTemporaryPath(filePath: Tracked): void {
  trackedPaths.delete(filePath);
}

export function trackCleanup(cleanup: () => void): () => void {
  trackTemporaryPath(cleanup);
  return () => {
    untrackTemporaryPath(cleanup);
  };
}

export function removeTrackedTemporaryPaths(): void {
  for (const entry of [...trackedPaths].reverse()) {
    trackedPaths.delete(entry);
    if (typeof entry === 'string') {
      rmSync(entry, { force: true, recursive: true });
    } else if (isCleanup(entry)) {
      entry();
    }
  }
}

function isCleanup(entry: unknown): entry is () => void {
  return typeof entry === 'function';
}

function installHandlers(): void {
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
