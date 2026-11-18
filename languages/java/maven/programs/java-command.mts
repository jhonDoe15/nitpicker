import type { SpawnSyncReturns } from 'node:child_process';
import { type JavaSpawn, callUntyped } from '../../adapters/typed/java-values.mts';
import { javaCommand as untypedJavaCommand, runJava as untypedRunJava } from '../maven-command.mjs';

export type JavaRun = {
  readonly tool: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly java?: string | undefined;
  readonly classpath?: readonly string[] | undefined;
  readonly mainClass?: string;
  readonly jvmArgs?: readonly string[];
  readonly accept?: (result: SpawnSyncReturns<string>) => boolean;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: number | undefined;
};

export const javaCommand: (name: string) => string = untypedJavaCommand;

export function runJava(options: JavaRun): unknown {
  return callUntyped(untypedRunJava, options);
}
