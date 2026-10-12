import { describe, expect, it } from 'vitest';
import { publicIndexFor } from '../../typescript/preset/architecture/strict-boundary-rules.mjs';

describe('the public index named in the boundary messages', () => {
  it('is index.js or index.mjs for a JavaScript project', () => {
    expect(publicIndexFor({ javascript: true })).toBe(
      'public index.js or index.mjs (src/main/features/<name>/index.js)',
    );
  });

  it('is index.ts for a TypeScript project', () => {
    expect(publicIndexFor({ javascript: false })).toBe(
      'public index.ts (src/main/features/<name>/index.ts)',
    );
  });
});
