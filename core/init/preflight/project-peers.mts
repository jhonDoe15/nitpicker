import {
  needsProjectTypeScript,
  runsProjectTests,
} from '../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { testRunnerFor } from '../../../languages/typescript/preset/test-runner/detect-runner.mjs';
import { listNames } from '../../../shared/messages/messages.mjs';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { describePackageManager } from '../detection/package-manager.mts';
import { type PeerNeeds, nodePeerNeeds, runnerPeers } from '../peers/node-peers.mts';
import { installCommand } from '../peers/peer-plan.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';
import type { PackageManager } from '../init-types.mts';

type PeerRun = {
  readonly projectRoot: string;
  readonly analyzers: readonly unknown[];
  readonly configuredRunner: unknown;
  readonly packageRoot?: string;
};

const TYPESCRIPT = 'typescript';

const runnerOf: (projectRoot: string, configured: unknown) => { readonly runner?: unknown } =
  testRunnerFor;

function neededPeers(
  projectRoot: string,
  analyzers: readonly unknown[],
  configuredRunner: unknown,
): string[] {
  const names = new Set(
    analyzers
      .filter((analyzer) => fieldOf(analyzer, 'policyFromPackage') === true)
      .map((analyzer) => fieldOf(analyzer, 'name')),
  );
  const needsTypeScript = [...names].some((name) => needsProjectTypeScript(name));
  const runsTests = [...names].some((name) => runsProjectTests(name));
  const runner = runsTests ? runnerOf(projectRoot, configuredRunner).runner : undefined;
  return [
    ...(needsTypeScript ? [TYPESCRIPT] : []),
    ...(runner === undefined ? [] : runnerPeers(textOf(runner))),
  ];
}

function verb(names: readonly string[]): string {
  return names.length > 1 ? 'are' : 'is';
}

function problems(projectRoot: string, { absent, outdated }: PeerNeeds): string[] {
  return [
    ...(absent.length === 0
      ? []
      : [`${textOf(listNames(absent))} ${verb(absent)} not installed in ${projectRoot}`]),
    ...outdated.map(
      ({ name, installed, range }) =>
        `${name} ${textOf(installed)} is installed and nitpicker needs ${textOf(range)}`,
    ),
  ];
}

function remedy(needs: PeerNeeds, manager: PackageManager): string {
  const { add, uninstalled } = needs;
  const pronoun = uninstalled.length > 1 ? 'they' : 'it';
  if (add.length === 0) {
    return `${manager.install} (${pronoun} ${verb(uninstalled)} in package.json)`;
  }
  const declared =
    uninstalled.length === 0
      ? ''
      : ` (it also installs ${textOf(listNames(uninstalled))} from package.json)`;
  return `${installCommand(manager.add, add)}${declared}`;
}

export function assertProjectPeers(run: PeerRun): void {
  const { projectRoot, analyzers, configuredRunner, packageRoot = PACKAGE_ROOT } = run;
  const names = neededPeers(projectRoot, analyzers, configuredRunner);
  const needs = nodePeerNeeds(projectRoot, names, { loadedFrom: { [TYPESCRIPT]: packageRoot } });
  if (needs.add.length === 0 && needs.uninstalled.length === 0) {
    return;
  }
  const manager = describePackageManager(projectRoot);
  throw new Error(`${problems(projectRoot, needs).join('; ')}. Run ${remedy(needs, manager)}.`);
}
