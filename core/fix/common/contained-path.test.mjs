import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { containedPath } from './contained-path.mjs';

const ROOT = path.resolve('project-root');

describe('containedPath', () => {
  it('resolves a relative name under the root', () => {
    expect(containedPath(ROOT, 'src/a.py')).toBe(path.join(ROOT, 'src', 'a.py'));
  });
  it.each(['../a.py', 'src/../../a.py', '..', '.'])('refuses %s', (name) => {
    expect(() => containedPath(ROOT, name)).toThrow(`${name} is outside ${ROOT}`);
  });
});
