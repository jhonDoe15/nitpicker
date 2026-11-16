import { createToolContext } from '../../../test-support/typed/tool-context.mts';
import type { ToolContext } from '../../../typed/context/tool-context-types.mts';
import type { Launcher } from '../../../typed/environment/launcher-types.mts';

type RetimeSetup = {
  readonly projectRoot: string;
  readonly reportRoot: string;
  readonly runner: string;
  readonly launcher: Launcher;
  readonly testSeconds?: unknown;
};

export function retimeContext({
  projectRoot,
  reportRoot,
  runner,
  launcher,
  testSeconds,
}: RetimeSetup): ToolContext {
  return {
    ...createToolContext({
      projectRoot,
      liveRoot: projectRoot,
      reportRoot,
      snapshot: 'head',
      settings: { testRunner: runner, testSeconds },
    }),
    launcher,
    env: {},
  };
}
