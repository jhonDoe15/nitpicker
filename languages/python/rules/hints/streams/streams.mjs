import { RULES_TOOL } from '../tool.mjs';

export const STREAM_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['streamed-rows-collected'],
    describe: (subject) =>
      `\`${subject}\` holds every row of a streamed query or server-side cursor at once, which is what streaming avoids and what runs out of memory on a large table`,
    allowed:
      'Work through a fixed-size batch inside the loop: append, and when `len(batch) >= 500` hand the batch on and `batch.clear()`; hand on the rest once after the loop. An exception fits only for a query that always returns few rows.',
  },
];
