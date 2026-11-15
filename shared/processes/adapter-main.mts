import { realpathSync } from 'node:fs';

const ADAPTER_FAILURE_EXIT = 2;

export function runAdapterMain(
  moduleFile: string,
  adapter: string,
  main: (runnerArguments: readonly string[]) => void,
): void {
  const invoked = process.argv[1];
  if (invoked === undefined || realpathSync(invoked) !== moduleFile) {
    return;
  }
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${adapter} differential adapter failed: ${reason}\n`);
    process.exitCode = ADAPTER_FAILURE_EXIT;
  }
}
