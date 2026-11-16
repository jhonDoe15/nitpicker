import {
  FAILSAFE_FIXTURE,
  INTEGRATION_FIXTURES,
  INTEGRATION_POLICY,
} from '../test-support/integration-projects.mts';

export {
  comparable,
  coverage,
  FULL_COVERAGE,
  moveIntegrationTest,
  mutations,
  slowTests,
  useIntegrationProjects,
  WITHOUT_FAREWELL,
} from '../test-support/integration-projects.mts';

export const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
export const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
export const maven = process.env['NITPICKER_MAVEN'];
export const fixtures = INTEGRATION_FIXTURES;
export const failsafeFixture = FAILSAFE_FIXTURE;
export const policy = INTEGRATION_POLICY;
