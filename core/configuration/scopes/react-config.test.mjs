import { describe, expect, it } from 'vitest';
import { validateConfig } from '../validate.mjs';

describe('the react key', () => {
  it.each([[{}], [{ enabled: true }], [{ enabled: false }], [{ styling: 'css-in-js' }]])(
    'is an error with the javascript preset, which points to the typescript preset (%j)',
    (react) => {
      expect(() => validateConfig({ preset: 'javascript', react })).toThrow(
        'nitpicker.config.json: "react" is not supported with "preset": "javascript": React and JSX belong to the TypeScript preset, so remove the key, or use "preset": "typescript" for a React project',
      );
    },
  );

  it('is still accepted with the typescript preset and with no preset', () => {
    const react = { enabled: true, styling: 'class-names' };

    expect(validateConfig({ preset: 'typescript', react })).toEqual({
      preset: 'typescript',
      react,
    });
    expect(validateConfig({ react })).toEqual({ react });
  });
});
