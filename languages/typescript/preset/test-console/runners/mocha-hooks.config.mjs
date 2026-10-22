import { createMochaHooks } from './mocha-capture.mjs';

export function mochaHooks() {
  return createMochaHooks({
    target: globalThis.console,
    environment: process.env,
    directory: process.cwd(),
  });
}
