import {
  TEST_RUNNER_ANALYZERS,
  TYPESCRIPT_FREE_ANALYZERS,
} from '../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { testRunnerFor } from '../../../languages/typescript/preset/test-runner/detect-runner.mjs';
import { listNames } from '../../../shared/messages/messages.mjs';
import { describePackageManager } from '../../init/detection/package-manager.mjs';
import { nodePeerNeeds, runnerPeers } from '../../init/peers/node-peers.mjs';
import { installCommand } from '../../init/peers/peer-plan.mjs';

const TYPESCRIPT = 'typescript';

function neededPeers(projectRoot, analyzers, configuredRunner) {
  const names = new Set(
    analyzers
      .filter((analyzer) => analyzer.policyFromPackage === true)
      .map((analyzer) => analyzer.name),
  );
  const needsTypeScript = [...names].some((name) => !TYPESCRIPT_FREE_ANALYZERS.has(name));
  const runsTests = [...TEST_RUNNER_ANALYZERS].some((name) => names.has(name));
  const runner = runsTests ? testRunnerFor(projectRoot, configuredRunner).runner : undefined;
  return [
    ...(needsTypeScript ? [TYPESCRIPT] : []),
    ...(runner === undefined ? [] : runnerPeers(runner)),
  ];
}

function verb(names) {
  return names.length > 1 ? 'are' : 'is';
}

function problems(projectRoot, { absent, outdated }) {
  return [
    ...(absent.length === 0
      ? []
      : [`${listNames(absent)} ${verb(absent)} not installed in ${projectRoot}`]),
    ...outdated.map(
      ({ name, installed, range }) =>
        `${name} ${installed} is installed and nitpicker needs ${range}`,
    ),
  ];
}

function remedy(needs, manager) {
  if (needs.add.length > 0) {
    return installCommand(manager.add, needs.add);
  }
  const pronoun = needs.uninstalled.length > 1 ? 'they' : 'it';
  return `${manager.install} (${pronoun} ${verb(needs.uninstalled)} in package.json)`;
}

export function assertProjectPeers({ projectRoot, analyzers, configuredRunner, nodeVersion }) {
  const names = neededPeers(projectRoot, analyzers, configuredRunner);
  const needs = nodePeerNeeds(projectRoot, names, nodeVersion);
  if (needs.add.length === 0 && needs.uninstalled.length === 0) {
    return;
  }
  const manager = describePackageManager(projectRoot);
  throw new Error(`${problems(projectRoot, needs).join('; ')}. Run ${remedy(needs, manager)}.`);
}
