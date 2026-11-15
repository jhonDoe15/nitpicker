import type { Environment } from '../../../../../shared/processes/environment.mts';

export type FakeResult = { status: number; stdout: string; stderr: string };
export type FakeInput = {
  readonly tool: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Environment;
};
export type FakeCall = FakeInput & {
  readonly result: FakeResult;
  appendOutput(stream: 'stdout' | 'stderr', text: string): void;
};
export type FakeTool = (call: FakeCall) => void;
export type FakeSpawnOptions = { readonly cwd: string; readonly env: Environment };
export type FakeSpawnResult = {
  readonly status: unknown;
  readonly signal: unknown;
  readonly stdout: string | Buffer;
  readonly stderr: string | Buffer;
  readonly error?: Error | undefined;
};
export type MutantsEntry = { readonly exitCodes: unknown; readonly mutated: string };
export type RecordedCall = { readonly tool: string } & Readonly<Record<string, unknown>>;
