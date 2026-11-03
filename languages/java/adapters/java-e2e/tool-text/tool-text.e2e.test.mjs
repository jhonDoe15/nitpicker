import { describe, expect, it } from 'vitest';
import {
  liveToolText,
  readToolText,
  TOOL_TEXT_TOOLS,
} from '../../../reference/tool-text/tool-text.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';

describe.skipIf(!enabled)('the JVM rule text snapshots against the pinned jars', () => {
  it.each(TOOL_TEXT_TOOLS)(
    'equal what the pinned %s jars hold (npm run gen:rules -- --refresh-jvm)',
    (tool) => {
      expect(liveToolText(tool)).toEqual(readToolText(tool));
    },
    180_000,
  );
});
