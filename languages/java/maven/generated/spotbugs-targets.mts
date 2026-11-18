import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import type { JavaSpawn } from '../../adapters/typed/java-values.mts';
import { runJava } from '../programs/java-command.mts';
import {
  type GeneratedLocation,
  PROCESSOR_OUTPUT,
  buildDirectoryOf,
  generatedRoots,
  handWrittenRoots,
} from './generated-roots.mts';

export type SpotbugsTargets = { readonly list: string; readonly empty: boolean };

type ClassModule = GeneratedLocation & {
  readonly sourceRoots: readonly string[];
  readonly outputDirectory: string;
};

type ListOptions = {
  readonly module: ClassModule;
  readonly reportDir: string;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: number | undefined;
};

const HELPER = path.join(GRADLE_DIRECTORY, 'generated', 'GeneratedClasses.java');
const TARGET_LIST = 'spotbugs-targets.txt';

function rootArguments(flag: string, roots: readonly string[]): string[] {
  return roots.flatMap((root) => [flag, root]);
}

export function handWrittenClasses({
  module,
  reportDir,
  spawn,
  timeoutMs,
}: ListOptions): SpotbugsTargets | undefined {
  const generated = [
    ...generatedRoots(module, module.sourceRoots),
    path.join(buildDirectoryOf(module), PROCESSOR_OUTPUT),
  ].filter((root) => existsSync(root));
  if (generated.length === 0) {
    return undefined;
  }
  const list = path.join(reportDir, TARGET_LIST);
  runJava({
    tool: 'GeneratedClasses',
    args: [
      HELPER,
      list,
      ...['--classes', module.outputDirectory],
      ...rootArguments('--generated', generated),
      ...rootArguments('--written', handWrittenRoots(module, module.sourceRoots, undefined)),
    ],
    cwd: module.basedir,
    accept: (result) => result.status === 0,
    spawn,
    timeoutMs,
  });
  return { list, empty: statSync(list).size === 0 };
}
