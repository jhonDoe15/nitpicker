import { describe, expect, it } from 'vitest';
import { validateConfig } from '../../../../core/config.mjs';

describe('size limits in the config', () => {
  const exception = { paths: ['src/main/**'], reason: 'Generated mapping' };

  it('takes the class and folder depth limits as whole numbers with the java preset', () => {
    const thresholds = { classMethods: 25, classFields: 12, inheritanceDepth: 4, folderDepth: 5 };
    expect(validateConfig({ preset: 'java', thresholds })).toEqual({
      preset: 'java',
      thresholds,
    });
    expect(() => validateConfig({ preset: 'java', thresholds: { classMethods: 2.5 } })).toThrow(
      '"thresholds.classMethods" must be a whole number',
    );
    expect(() => validateConfig({ preset: 'java', thresholds: { folderDepth: 0 } })).toThrow(
      '"thresholds.folderDepth" must be a positive number',
    );
  });

  it.each([
    ['classMethods', ['typescript', 'javascript', 'python']],
    ['classFields', ['typescript', 'python']],
    ['inheritanceDepth', ['typescript', 'python']],
    ['folderDepth', ['python']],
  ])('rejects thresholds.%s where the preset does not enforce it', (key, presets) => {
    for (const preset of presets) {
      expect(() => validateConfig({ preset, thresholds: { [key]: 3 } })).toThrow(
        `"thresholds.${key}" is only supported with "preset": `,
      );
    }
  });

  it('takes folderDepth with the typescript, javascript and kotlin presets, and by default', () => {
    for (const preset of [undefined, 'typescript', 'javascript', 'kotlin']) {
      const config = {
        ...(preset === undefined ? {} : { preset }),
        thresholds: { folderDepth: 2 },
      };
      expect(validateConfig(config)).toEqual(config);
    }
  });

  it('lets presets lift the size rules they enforce', () => {
    const lifts = (preset, rule) =>
      validateConfig({ preset, exceptions: [{ rule, ...exception }] });
    for (const rule of [
      'folder-depth-limit',
      'class-methods-limit',
      'class-fields-limit',
      'inheritance-depth-limit',
    ]) {
      expect(lifts('java', rule).preset).toBe('java');
    }
    expect(lifts('kotlin', 'folder-depth-limit').preset).toBe('kotlin');
    expect(lifts('typescript', 'folder-depth-limit').preset).toBe('typescript');
    expect(lifts('kotlin', 'class-methods-limit').preset).toBe('kotlin');
    expect(lifts('kotlin', 'inheritance-depth-limit').preset).toBe('kotlin');
  });
});
