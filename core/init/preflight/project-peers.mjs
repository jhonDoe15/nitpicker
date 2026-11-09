import {
  needsProjectTypeScript,
  runsProjectTests,
} from '../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { testRunnerFor } from '../../../languages/typescript/preset/test-runner/detect-runner.mjs';
import { listNames } from '../../../shared/messages/messages.mjs';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { describePackageManager } from '../detection/package-manager.mjs';
import { nodePeerNeeds, runnerPeers } from '../peers/node-peers.mjs';
import { installCommand } from '../peers/peer-plan.mjs';

const TYPESCRIPT = 'typescript';

function neededPeers(projectRoot, analyzers, configuredRunner) {
  const names = new Set(
    analyzers
      .filter((analyzer) => analyzer.policyFromPackage === true)
      .map((analyzer) => analyzer.name),
  );
  const needsTypeScript = [...names].some(needsProjectTypeScript);
  const runsTests = [...names].some(runsProjectTests);
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
  const { add, uninstalled } = needs;
  const pronoun = uninstalled.length > 1 ? 'they' : 'it';
  if (add.length === 0) {
    return `${manager.install} (${pronoun} ${verb(uninstalled)} in package.json)`;
  }
  const declared =
    uninstalled.length === 0
      ? ''
      : ` (it also installs ${listNames(uninstalled)} from package.json)`;
  return `${installCommand(manager.add, add)}${declared}`;
}

export function assertProjectPeers(run) {
  const { projectRoot, analyzers, configuredRunner, packageRoot = PACKAGE_ROOT } = run;
  const names = neededPeers(projectRoot, analyzers, configuredRunner);
  const needs = nodePeerNeeds(projectRoot, names, { loadedFrom: { [TYPESCRIPT]: packageRoot } });
  if (needs.add.length === 0 && needs.uninstalled.length === 0) {
    return;
  }
  const manager = describePackageManager(projectRoot);
  throw new Error(`${problems(projectRoot, needs).join('; ')}. Run ${remedy(needs, manager)}.`);
}
