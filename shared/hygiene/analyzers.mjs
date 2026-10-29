import { createHash } from 'node:crypto';
import path from 'node:path';
import { importClosure } from '../import-closure.mjs';
import { REPOSITORY_HYGIENE_TOOL } from './files/repository-files.mjs';

const sharedRoot = path.resolve(import.meta.dirname, '..');
const HYGIENE_RUNNER = 'hygiene/runner.mjs';
const ANALYZER_VERSION = '1';

export function configurationFiles(runner = HYGIENE_RUNNER) {
  return [...importClosure([runner], sharedRoot).keys()].sort();
}

function hashConfiguration(runner) {
  const sources = importClosure([runner], sharedRoot);
  const hash = createHash('sha256');
  for (const file of [...sources.keys()].sort()) {
    hash.update(`${file}\0`);
    hash.update(sources.get(file));
  }
  return hash.digest('hex');
}

function withEnvironmentToken(sourceHash, environmentToken) {
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
  command,
  runner,
  entryPath,
  extraArguments = () => [],
  environmentToken,
}) {
  const sourceHash = hashConfiguration(runner);
  return {
    name,
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

export function createHygieneAnalyzers(entryPath) {
  return [
    createCheckAnalyzer({
      name: REPOSITORY_HYGIENE_TOOL,
      command: 'hygiene',
      runner: HYGIENE_RUNNER,
      entryPath,
    }),
  ];
}
