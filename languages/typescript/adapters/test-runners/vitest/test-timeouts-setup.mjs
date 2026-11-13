import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isIntegrationTestFor } from '../../../preset/layout/end-to-end-tests.mjs';
import { resolveTestTimeouts } from '../../../../../shared/test-timeouts/resolve.mjs';

export function applyVitestTimeouts(policy, { file, root = process.cwd() }, configure) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const limits = resolveTestTimeouts(policy, {
    file: relative,
    language: policy.preset === 'javascript' ? 'javascript' : 'typescript',
    integration: isIntegrationTestFor(relative, policy),
  });
  const settings = Object.fromEntries(
    Object.entries(limits)
      .filter(
        ([key, value]) =>
          ['testTimeoutMs', 'hookTimeoutMs'].includes(key) && typeof value === 'number',
      )
      .map(([key, value]) => [key.replace('Ms', ''), value]),
  );
  configure(settings);
  return limits;
}

export function timeoutSetupSource(policyRoot) {
  const shared = pathToFileURL(path.join(policyRoot, 'shared')).href;
  const setup = pathToFileURL(
    path.join(
      policyRoot,
      'languages/typescript/adapters/test-runners/vitest/test-timeouts-setup.mjs',
    ),
  ).href;
  return `import { expect, vi } from 'vitest';
import { applyVitestTimeouts } from ${JSON.stringify(setup)};
import { readHeadPolicyFile } from ${JSON.stringify(`${shared}/head-policy.mjs`)};
applyVitestTimeouts(readHeadPolicyFile(), { file: expect.getState().testPath }, (settings) => {
  vi.setConfig(settings);
});
`;
}
