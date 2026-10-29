import { realpathSync, writeFileSync, writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  PROBE_FILE,
  currentDrift,
  printProbe,
  readProbe,
  runProbe,
} from '../languages/java/adapters/overlaps/test-support/probe-run.mjs';

const OPTIONS = ['gradle', 'maven', 'build'];
const STDERR = 2;

function runOptions(argv) {
  return Object.fromEntries(
    OPTIONS.flatMap((name) => {
      const prefix = `--${name}=`;
      const given = argv.find((argument) => argument.startsWith(prefix));
      return given === undefined ? [] : [[name, given.slice(prefix.length)]];
    }),
  );
}

function driftReport({ added, removed }) {
  return [
    'Stale overlap probe fixture (run npm run gen:overlap-probe):',
    ...removed.map((line) => `- ${line}`),
    ...added.map((line) => `+ ${line}`),
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const options = runOptions(process.argv);
  if (process.argv.includes('--check')) {
    const drift = currentDrift(options);
    if (!drift.formatted) {
      writeSync(STDERR, `${driftReport(drift)}\n`);
      process.exitCode = 1;
    }
  } else {
    writeFileSync(PROBE_FILE, printProbe(runProbe(readProbe().sources, options)));
  }
}
