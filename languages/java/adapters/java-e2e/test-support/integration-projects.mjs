import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

const fixtures = path.join(import.meta.dirname, '../../fixtures');
const failsafeFixture = path.join(import.meta.dirname, '../../../maven/fixtures/failsafe');

export const INTEGRATION_POLICY = { testSeconds: { integrationTestSeconds: -1 } };
export const INTEGRATION_FIXTURES = fixtures;
export const FAILSAFE_FIXTURE = failsafeFixture;
export const FULL_COVERAGE = ['line-coverage 100% (3/3)'];
export const WITHOUT_FAREWELL = [
  'line-coverage 66.67% (2/3)',
  'Method demo.Greeter#farewell(Ljava/lang/String;)Ljava/lang/String; is not covered',
];

export function useIntegrationProjects() {
  const temporary = [];

  afterAll(() => {
    for (const root of temporary.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  return function projectOf(fixture, { sources = false } = {}) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-integration-e2e-'));
    temporary.push(root);
    cpSync(fixture, root, { recursive: true });
    if (sources) {
      cpSync(path.join(failsafeFixture, 'src'), path.join(root, 'src'), { recursive: true });
    }
    return root;
  };
}

export function moveIntegrationTest(project) {
  mkdirSync(path.join(project, 'src/integrationTest/java/demo'), { recursive: true });
  renameSync(
    path.join(project, 'src/test/java/demo/GreeterIT.java'),
    path.join(project, 'src/integrationTest/java/demo/GreeterIT.java'),
  );
}

export const comparable = (findings) =>
  findings
    .filter(({ tool }) => tool !== 'test-runtime')
    .map((finding) => JSON.stringify(finding))
    .sort();

export const slowTests = (findings) =>
  findings
    .filter(({ tool }) => tool === 'test-runtime')
    .map(({ path: file, message }) => `${file}: ${message.split(' took ')[0]}`);

export const coverage = (findings) =>
  findings.filter(({ tool }) => tool === 'jacoco').map(({ message }) => message);

export const mutations = (findings) =>
  findings.filter(({ tool }) => tool === 'pit').map(({ rule, identity }) => `${rule} ${identity}`);
