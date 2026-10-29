import { beforeAll, describe, expect, it } from 'vitest';
import { currentDrift } from '../overlaps/test-support/probe-run.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

describe.skipIf(!enabled)('the overlap probe fixture', () => {
  let drift;

  beforeAll(() => {
    drift = currentDrift({ gradle });
  });

  it('equals a fresh run of the pinned tools (run npm run gen:overlap-probe)', () => {
    expect(drift).toStrictEqual({ added: [], removed: [], formatted: true });
  });
});
