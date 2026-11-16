import { beforeAll, describe, expect, it } from 'vitest';
import { currentDrift } from '../overlaps/test-support/probe-run.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const maven = process.env['NITPICKER_MAVEN'];

describe.skipIf(!enabled).each(['gradle', 'maven'] as const)(
  'the overlap probe fixture on %s',
  (build) => {
    let drift: ReturnType<typeof currentDrift>;

    beforeAll(() => {
      drift = currentDrift({ gradle, maven, build });
    });

    it('equals a fresh run of the pinned tools (run npm run gen:overlap-probe)', () => {
      expect(drift).toStrictEqual({ added: [], removed: [], formatted: true });
    });
  },
);
