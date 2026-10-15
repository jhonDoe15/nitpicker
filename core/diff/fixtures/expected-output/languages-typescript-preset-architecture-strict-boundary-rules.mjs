import { expect } from 'vitest';
export function expectedOutput52_57() {
  return [
    'domain-does-not-import-adapters',
    'domain-does-not-import-module-state',
    'domain-does-not-import-network-or-database-clients',
    'domain-does-not-import-node-io',
    'domain-does-not-import-the-logger',
    'feature-internals-only-through-index',
    'features-do-not-import-composition-root',
    'features-do-not-import-other-feature-internals',
    'shared-does-not-import-features',
  ];
}
