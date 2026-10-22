import { createMochaHooks } from './mocha-capture.mjs';

export function mochaHooks() {
  return createMochaHooks({ environment: process.env });
}
