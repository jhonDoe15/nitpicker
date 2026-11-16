import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

type BuildTree = {
  readonly depth: number;
  readonly exitOnTerm: boolean;
  readonly output: { write(text: string): unknown };
  readonly stop: () => void;
};

function runBuildTree({ depth, exitOnTerm, output, stop }: BuildTree): void {
  process.on('SIGTERM', () => {
    if (depth === 0 && exitOnTerm) {
      stop();
    }
  });
  output.write(`${String(process.pid)}\n`);
  if (depth < 2) {
    spawn(process.execPath, [import.meta.filename, String(depth + 1)], { stdio: 'inherit' });
  }
  setInterval(() => {}, 1_000);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runBuildTree({
    depth: Number(process.argv[2] ?? 0),
    exitOnTerm: process.argv[3] === 'exit',
    output: process.stdout,
    stop: () => {
      process.exit(0);
    },
  });
}
