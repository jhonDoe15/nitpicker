import { afterAll, beforeAll } from 'vitest';
import {
  fixtureSource,
  kotlinRuleCases,
} from '../../kotlin/rules/test-support/kotlin-rule-cases.mjs';
import {
  EXTRA_SOURCES,
  HOSTILE_DETEKT_CONFIG,
  ruleFixtures,
} from '../test-support/kotlin-one-way-data.mjs';
import {
  commitBranch,
  diffOf,
  initializeProject,
  kotlinPolicyWithProjectDetekt,
  removeProject,
} from '../test-support/kotlin-e2e-project.mjs';

// Each file gets its own fixture tree and retains the original setup and cleanup.
export function useKotlinOneWayProject(scenario) {
  let project;
  let bannedResult;
  let allowedResult;
  let hostileConfigResult;
  let testSourceResult;
  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'one-way-banned', ruleFixtures('banned'));
    commitBranch(project, 'one-way-allowed', ruleFixtures('allowed'));
    commitBranch(project, 'one-way-hostile-config', {
      ...ruleFixtures('banned'),
      'config/detekt/detekt.yml': HOSTILE_DETEKT_CONFIG,
      ...Object.fromEntries(
        Object.entries(EXTRA_SOURCES).map(([name, text]) => [
          `src/main/kotlin/demo/extras/${name}`,
          text,
        ]),
      ),
    });
    if (scenario === 'test-source') {
      commitBranch(project, 'one-way-test-source', {
        'src/test/kotlin/demo/swallowedException/SwallowedTest.kt': fixtureSource(
          kotlinRuleCases.find(({ id }) => id === 'swallowedException'),
          'banned',
        ),
      });
      testSourceResult = diffOf(project, 'one-way-test-source');
    }
    if (scenario === 'banned') {
      bannedResult = diffOf(project, 'one-way-banned');
    }
    if (scenario === 'allowed') {
      allowedResult = diffOf(project, 'one-way-allowed');
    }
    if (scenario === 'hostile-config') {
      hostileConfigResult = diffOf(project, 'one-way-hostile-config', {
        policy: kotlinPolicyWithProjectDetekt,
      });
    }
  });
  afterAll(() => {
    removeProject(project);
  });
  return {
    get project() {
      return project;
    },
    get bannedResult() {
      return bannedResult;
    },
    get allowedResult() {
      return allowedResult;
    },
    get testSourceResult() {
      return testSourceResult;
    },
    get hostileConfigResult() {
      return hostileConfigResult;
    },
  };
}
