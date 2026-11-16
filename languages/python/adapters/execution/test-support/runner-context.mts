import type { Launcher } from '../../typed/environment/launcher-types.mts';
import type { ToolContext } from '../../typed/context/tool-context-types.mts';

type RunnerContextOptions = {
  readonly projectRoot: string;
  readonly testRunner: string;
  readonly reportRoot?: string;
  readonly launcher?: Launcher;
};

const NO_LAUNCH: Launcher = {
  description: 'test',
  launch: () => ({ command: process.execPath, args: [], env: {} }),
};

export function runnerContext({
  projectRoot,
  testRunner,
  reportRoot = '/reports',
  launcher = NO_LAUNCH,
}: RunnerContextOptions): ToolContext {
  return {
    projectRoot,
    reportRoot,
    snapshot: 'head',
    baselineRoot: undefined,
    testSeconds: undefined,
    conventions: {},
    layout: {},
    policyRoot: undefined,
    toolPrecedence: undefined,
    probes: new Map(),
    spawn: undefined,
    launcher,
    exclude: [],
    duplicateSkippedFolders: undefined,
    pytestAddopts: undefined,
    mutationScope: undefined,
    analyzerDeadlineMs: undefined,
    quick: false,
    project: {
      formatter: 'ruff',
      formatterDetected: false,
      typeCheckers: [],
      testRunner,
      targetVersion: 'py38',
      importLinter: undefined,
      sourceRoots: ['.'],
      entryPoints: undefined,
    },
    env: {},
  };
}
