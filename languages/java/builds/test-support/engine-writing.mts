import { writeFileSync } from 'node:fs';

export type Started = { readonly argumentList: readonly string[]; readonly environment: unknown };

export function engineWriting(report: unknown, started: Started[] = []) {
  return (argumentList: readonly string[], options: { readonly environment: unknown }) => {
    started.push({ argumentList, environment: options.environment });
    writeFileSync(argumentList.at(-1) ?? '', JSON.stringify(report));
    return { status: 0, stdout: '', stderr: '' };
  };
}
