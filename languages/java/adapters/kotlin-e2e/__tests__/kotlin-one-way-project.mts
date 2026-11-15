import { afterAll, beforeAll } from 'vitest';
import { assigned } from '../test-support/views/assigned.mts';
import {
  EXTRA_SOURCES,
  HOSTILE_DETEKT_CONFIG,
  ruleFixtures,
} from '../test-support/kotlin-one-way-data.mts';
import {
  commitBranch,
  diffOf,
  initializeProject,
  kotlinPolicyWithProjectDetekt,
  removeProject,
  type DiffOptions,
  type DiffResult,
  type KotlinProject,
} from './kotlin-e2e-project.mts';

// Each file gets its own fixture tree and retains the original setup and cleanup.
export function useKotlinOneWayProject(
  scenario: 'banned' | 'allowed' | 'hostile-config',
  {
    initialize = initializeProject,
    run = diffOf,
  }: {
    initialize?: () => KotlinProject;
    run?: (project: KotlinProject, branch: string, options?: DiffOptions) => DiffResult;
  } = {},
): {
  readonly project: KotlinProject;
  readonly bannedResult: DiffResult;
  readonly allowedResult: DiffResult;
  readonly hostileConfigResult: DiffResult;
} {
  let project: KotlinProject | undefined;
  let bannedResult: DiffResult | undefined;
  let allowedResult: DiffResult | undefined;
  let hostileConfigResult: DiffResult | undefined;
  beforeAll(() => {
    const created = initialize();
    project = created;
    commitBranch(created, 'one-way-banned', ruleFixtures('banned'));
    commitBranch(created, 'one-way-allowed', ruleFixtures('allowed'));
    commitBranch(created, 'one-way-hostile-config', {
      ...ruleFixtures('banned'),
      'config/detekt/detekt.yml': HOSTILE_DETEKT_CONFIG,
      ...Object.fromEntries(
        Object.entries(EXTRA_SOURCES).map(([name, text]) => [
          `src/main/kotlin/demo/extras/${name}`,
          text,
        ]),
      ),
    });
    if (scenario === 'banned') {
      bannedResult = run(created, 'one-way-banned');
    }
    if (scenario === 'allowed') {
      allowedResult = run(created, 'one-way-allowed');
    }
    if (scenario === 'hostile-config') {
      hostileConfigResult = run(created, 'one-way-hostile-config', {
        policy: kotlinPolicyWithProjectDetekt,
      });
    }
  });
  afterAll(() => {
    removeProject(assigned(project, 'project'));
  });
  return {
    get project() {
      return assigned(project, 'project');
    },
    get bannedResult() {
      return assigned(bannedResult, 'bannedResult');
    },
    get allowedResult() {
      return assigned(allowedResult, 'allowedResult');
    },
    get hostileConfigResult() {
      return assigned(hostileConfigResult, 'hostileConfigResult');
    },
  };
}
