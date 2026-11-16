import { callUntyped as call } from '../../../../../shared/values/boundaries/untyped-call.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import {
  detectEnvironment as untypedDetect,
  openEnvironment as untypedOpen,
  openSnapshotEnvironment as untypedSnapshot,
} from '../../execution/python-environment.mjs';
import { baseEnvironment as untypedBase } from '../../execution/environments/base/base-environment.mjs';

type LaunchSpec = {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
};

export type Launcher = {
  readonly description: string;
  launch(tool: string, args: readonly string[]): LaunchSpec;
};

type SnapshotOptions = {
  readonly projectRoot: string;
  readonly liveRoot: string;
  readonly setting: string | undefined;
  readonly spawn: unknown;
};

type BaseOptions = {
  readonly projectRoot: string;
  readonly liveRoot: string;
  readonly setting: string | undefined;
  readonly virtualenv: (directory: string, description: string) => unknown;
};

function isLauncher(value: unknown): value is Launcher {
  return (
    typeof fieldOf(value, 'description') === 'string' &&
    typeof fieldOf(value, 'launch') === 'function'
  );
}

function launcherOf(value: unknown): Launcher {
  if (!isLauncher(value)) {
    throw new Error('The environment launcher is malformed');
  }
  return value;
}

export function detectEnvironment(projectRoot: string, setting?: string): unknown {
  return call(untypedDetect, projectRoot, setting);
}

export function openEnvironment(
  environment: object,
  projectRoot: string,
  spawn?: unknown,
): Launcher {
  return launcherOf(call(untypedOpen, environment, projectRoot, spawn));
}

export function openSnapshotEnvironment(options: SnapshotOptions): Launcher {
  return launcherOf(call(untypedSnapshot, options));
}

export function baseEnvironment(options: BaseOptions): unknown {
  return call(untypedBase, options);
}
