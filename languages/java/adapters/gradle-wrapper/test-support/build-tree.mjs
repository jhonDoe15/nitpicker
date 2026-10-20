import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function runBuildTree({ depth, exitOnTerm, output, stop }) {
  process.on('SIGTERM', () => {
    if (depth === 0 && exitOnTerm) {
      stop();
    }
  });
  output.write(`${process.pid}\n`);
  if (depth < 2) {
    spawn(process.execPath, [import.meta.filename, String(depth + 1)], { stdio: 'inherit' });
  }
  setInterval(() => {}, 1_000);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runBuildTree({
    depth: Number(process.argv[2] ?? 0),
    exitOnTerm: process.argv[3] === 'exit',
    output: process.stdout,
    stop: () => {
      process.exit(0);
    },
  });
}
