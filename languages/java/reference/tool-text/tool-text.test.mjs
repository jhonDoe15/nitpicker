import { describe, expect, it } from 'vitest';
import { pinnedToolTextVersion, readToolText, TOOL_TEXT_TOOLS } from './tool-text.mjs';

describe('the JVM rule text snapshots', () => {
  it.each(TOOL_TEXT_TOOLS)(
    'come from the %s version that nitpicker.init.gradle pins (npm run gen:rules -- --refresh-jvm)',
    (tool) => {
      expect(readToolText(tool).version).toBe(pinnedToolTextVersion(tool));
    },
  );
});
