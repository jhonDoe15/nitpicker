import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type Started = { readonly argumentList: readonly string[]; readonly environment: unknown };

export function engineWriting(report: unknown, started: Started[] = []) {
  return (argumentList: readonly string[], options: { readonly environment: unknown }) => {
    started.push({ argumentList, environment: options.environment });
    writeFileSync(argumentList.at(-1) ?? '', JSON.stringify(report));
    return { status: 0, stdout: '', stderr: '' };
  };
}

export function engineFolders(root: string): {
  readonly reportDir: string;
  readonly javaHome: string;
} {
  const reportDir = path.join(root, 'report');
  const javaHome = path.join(root, 'jdk');
  mkdirSync(reportDir);
  mkdirSync(path.join(javaHome, 'jmods'), { recursive: true });
  return { reportDir, javaHome };
}
