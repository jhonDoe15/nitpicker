import { createHash } from 'node:crypto';
import path from 'node:path';
import { importClosure } from '../import-closure.mts';
import { byText } from '../text-order/by-text.mts';
import { REPOSITORY_HYGIENE_TOOL } from './files/repository-files.mts';
import { REPOSITORY_INPUTS } from '../input-sets/inputs.mts';
import type { CheckAnalyzer, CheckAnalyzerOptions, InvocationContext } from './check-types.mts';

const sharedRoot = path.resolve(import.meta.dirname, '..');
const HYGIENE_RUNNER = 'hygiene/runner.mjs';
const ANALYZER_VERSION = '1';

export function configurationFiles(runner = HYGIENE_RUNNER): string[] {
  return [...importClosure([runner], sharedRoot).keys()].sort(byText);
}

function hashConfiguration(runner: string): string {
  const sources = importClosure([runner], sharedRoot);
  const hash = createHash('sha256');
  for (const [file, contents] of [...sources].sort(([left], [right]) => byText(left, right))) {
    hash.update(`${file}\0`);
    hash.update(contents);
  }
  return hash.digest('hex');
}

function withEnvironmentToken(
  sourceHash: string,
  environmentToken: CheckAnalyzerOptions['environmentToken'],
): Pick<CheckAnalyzer, 'resolveConfigurationHash'> {
  return environmentToken === undefined
    ? {}
    : {
        resolveConfigurationHash(policyRoot) {
          return createHash('sha256')
            .update(`${sourceHash}\0${environmentToken(policyRoot)}`)
            .digest('hex');
        },
      };
}

export function createCheckAnalyzer({
  name,
  inputs,
  command,
  runner,
  entryPath,
  extraArguments = () => [],
  environmentToken,
}: CheckAnalyzerOptions): CheckAnalyzer {
  const sourceHash = hashConfiguration(runner);
  return {
    name,
    inputs,
    version: ANALYZER_VERSION,
    configurationHash: sourceHash,
    exclusions: [],
    ...withEnvironmentToken(sourceHash, environmentToken),
    createInvocation(context) {
      return {
        command: process.execPath,
        args: [
          entryPath,
          command,
          '--check',
          name,
          '--project-root',
          context.projectRoot,
          ...extraArguments(context),
        ],
        cwd: context.toolRoot,
      };
    },
  };
}

function comparedBase({ snapshot, baselineRoot }: InvocationContext): string[] {
  return snapshot === 'head' && baselineRoot !== undefined ? ['--baseline-root', baselineRoot] : [];
}

export function createHygieneAnalyzers(entryPath: string): CheckAnalyzer[] {
  return [
    createCheckAnalyzer({
      name: REPOSITORY_HYGIENE_TOOL,
      command: 'hygiene',
      runner: HYGIENE_RUNNER,
      entryPath,
      extraArguments: comparedBase,
      inputs: REPOSITORY_INPUTS,
    }),
  ];
}
