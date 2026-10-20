import path from 'node:path';
import { expect, vi } from 'vitest';
import { readConfigFile } from '../../core/configuration/config.mjs';
import { applyVitestTimeouts } from '../../languages/typescript/adapters/test-runners/vitest/test-timeouts-setup.mjs';

const root = path.resolve(import.meta.dirname, '../..');
applyVitestTimeouts(
  readConfigFile(root),
  { file: expect.getState().testPath, root },
  (settings) => {
    vi.setConfig(settings);
  },
);
