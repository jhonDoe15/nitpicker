import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkoutModuleUrl } from '../../../../../shared/paths/checkout-module.mjs';
import { isIntegrationTestFor, resolveTestTimeouts } from '../typed/timeouts.mts';
import type { TimeoutLimits } from '../typed/runner-types.mts';

export function applyVitestTimeouts(
  policy: Parameters<typeof resolveTestTimeouts>[0],
  { file, root = process.cwd() }: { readonly file: string; readonly root?: string },
  configure: (settings: Readonly<Record<string, unknown>>) => void,
): TimeoutLimits {
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

export function timeoutSetupSource(policyRoot: string): string {
  const shared = pathToFileURL(path.join(policyRoot, 'shared')).href;
  const setup = checkoutModuleUrl(
    pathToFileURL(
      path.join(
        policyRoot,
        'languages/typescript/adapters/test-runners/vitest/test-timeouts-setup.mjs',
      ),
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
