import { describe, expect, it } from 'vitest';
import { inModule } from './module-path.mjs';

describe('inModule', () => {
  it('puts a module-relative path under the module path, and leaves a root module path alone', () => {
    expect(inModule('core', 'src/test/java/A.java')).toBe('core/src/test/java/A.java');
    expect(inModule('services/core', '.')).toBe('services/core');
    expect(inModule('', 'src/A.java')).toBe('src/A.java');
    expect(inModule(undefined, '.')).toBe('.');
  });
});
