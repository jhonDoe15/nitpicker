import { realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readDurations } from './sequencer.mjs';
import { durationFile } from './duration-profile.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const RECORDED_ABOVE_SECONDS = 1;

const secondsOf = (diagnostic) =>
  Math.ceil(
    (diagnostic.environmentSetupDuration +
      diagnostic.prepareDuration +
      diagnostic.collectDuration +
      diagnostic.setupDuration +
      diagnostic.duration) /
      1000,
  );

export function mergeDurations(previous, modules, root) {
  const measured = new Map(
    modules.map(({ moduleId, diagnostic }) => [
      path.relative(root, moduleId).split(path.sep).join('/'),
      secondsOf(diagnostic),
    ]),
  );
  const kept = [...previous].filter(([file]) => !measured.has(file));
  const recorded = [...measured].filter(([, seconds]) => seconds > RECORDED_ABOVE_SECONDS);
  return Object.fromEntries(
    [...kept, ...recorded].toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

async function recordDurations(argv) {
  const file = durationFile();
  const { parseCLI, startVitest } = await import('vitest/node');
  const { filter, options } = parseCLI(['vitest', 'run', ...argv]);
  const modules = [];
  const reporter = {
    onTestRunEnd: (testModules) => {
      modules.push(
        ...testModules.map((testModule) => ({
          moduleId: testModule.moduleId,
          diagnostic: testModule.diagnostic(),
        })),
      );
    },
  };
  const vitest = await startVitest('test', filter, {
    ...options,
    config: path.join(repositoryRoot, 'vitest.config.mts'),
    run: true,
    reporters: ['default', reporter],
  });
  await vitest.close();
  if (process.exitCode) return;
  const durations = mergeDurations(readDurations(file), modules, repositoryRoot);
  writeFileSync(file, `${JSON.stringify(durations, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await recordDurations(process.argv.slice(2));
}
