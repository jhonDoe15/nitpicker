import { realpathSync } from 'node:fs';

const ADAPTER_FAILURE_EXIT = 2;

export type AdapterProcess = {
  readonly argv: readonly string[];
  readonly stderr: { write(text: string): unknown };
};

export type AdapterEntry = {
  readonly moduleFile: string;
  readonly adapter: string;
  readonly main: (runnerArguments: readonly string[]) => void;
};

export function runAdapterMain(
  { moduleFile, adapter, main }: AdapterEntry,
  { argv, stderr }: AdapterProcess,
): number | undefined {
  const invoked = argv[1];
  if (invoked === undefined || realpathSync(invoked) !== moduleFile) {
    return undefined;
  }
  try {
    main(argv.slice(2));
    return undefined;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    stderr.write(`${adapter} differential adapter failed: ${reason}\n`);
    return ADAPTER_FAILURE_EXIT;
  }
}
