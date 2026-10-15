import { describe, expect, it } from 'vitest';
import { cruise } from './cruise.mjs';
import { cruiseInProcess } from './test-support/in-process-cruise.mjs';

describe('in-process dependency graph fixture', () => {
  // The only test that runs the production `cruise()` CLI call (one dependency-cruiser process). The
  // policy tests use `cruiseInProcess` for speed; this test keeps that helper honest against the real call.
  it('returns the same modules as the production cruise() run', async () => {
    const paths = ['languages/typescript/preset/coupling/fixtures/signal/src/main'];
    const options = { typeScriptRoot: 'languages/typescript/preset/coupling/fixtures/signal' };

    expect((await cruiseInProcess(paths, options)).modules).toEqual(cruise(paths, options).modules);
  });
});
