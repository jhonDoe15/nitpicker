import { describe, expect, it } from 'vitest';
import { conventionChoices, detectConventions } from '../../../shared/conventions/detect.mjs';
import {
  FILE_NAME_CONVENTION,
  fileNameCasingOption,
  fileNameComplies,
  fittingCasings,
} from './file-name-casing.mjs';

const vote = (file) => FILE_NAME_CONVENTION.measure('', file);

describe('file name casing votes', () => {
  it.each([
    ['src/user-profile.ts', 'kebab-case'],
    ['src/userProfile.ts', 'camelCase'],
    ['src/UserProfile.ts', 'PascalCase'],
    ['src/user_profile.ts', 'snake_case'],
    ['src/user-profile.test.ts', 'kebab-case'],
    ['src/userProfile.spec.mjs', 'camelCase'],
    ['src/Button.ts', 'PascalCase'],
    ['src/index.ts', undefined],
    ['src/utils.ts', undefined],
    ['src/v2.ts', undefined],
    ['src/404.ts', undefined],
    ['src/user-Profile.ts', undefined],
    ['src/UserProfile.tsx', undefined],
    ['src/UserProfile.test.tsx', undefined],
    ['src/UserProfile.jsx', undefined],
    ['src/use-session.tsx', 'kebab-case'],
    ['src/useSession.tsx', 'camelCase'],
    ['vite.config.ts', undefined],
    ['lintStaged.config.mjs', undefined],
    ['app/routes/[id].tsx', undefined],
    ['app/routes/_layout.tsx', undefined],
    ['app/routes/+page.server.ts', undefined],
    ['app/routes/$postId.tsx', undefined],
    ['src/.eslintrc.js', undefined],
  ])('%s votes %s', (file, expected) => {
    expect(vote(file)).toBe(expected);
  });
});

describe('file name casing compliance', () => {
  it.each([
    ['src/index.ts', 'kebab-case', true],
    ['src/index.ts', 'PascalCase', false],
    ['src/utils.ts', 'camelCase', true],
    ['src/utils.ts', 'snake_case', true],
    ['src/user-profile.ts', 'kebab-case', true],
    ['src/user-profile.ts', 'camelCase', false],
    ['src/userProfile.ts', 'kebab-case', false],
    ['src/UserProfile.ts', 'kebab-case', false],
    ['src/UserProfile.tsx', 'kebab-case', true],
    ['src/UserProfile.stories.tsx', 'camelCase', true],
    ['src/user-profile.tsx', 'PascalCase', false],
    ['src/user-Profile.ts', 'kebab-case', false],
    ['vite.config.ts', 'PascalCase', true],
    ['app/[id].tsx', 'kebab-case', true],
    ['app/_app.tsx', 'kebab-case', true],
    ['app/+layout.ts', 'camelCase', true],
    ['app/$id.ts', 'snake_case', true],
    ['src\\userProfile.ts', 'camelCase', true],
  ])('%s under %s is %s', (file, casing, expected) => {
    expect(fileNameComplies(file, casing)).toBe(expected);
  });

  it('lists every casing a name fits', () => {
    expect(fittingCasings('utils')).toEqual(['kebab-case', 'camelCase', 'snake_case']);
    expect(fittingCasings('Utils')).toEqual(['PascalCase']);
    expect(fittingCasings('user-Profile')).toEqual([]);
  });

  it('falls back to kebab-case until a convention is followed', () => {
    expect(fileNameCasingOption()).toBe('kebab-case');
    expect(fileNameCasingOption({ 'typescript.fileNames': 'camelCase' })).toBe('camelCase');
  });
});

describe('file name casing detection', () => {
  const detect = (names) =>
    detectConventions({
      definitions: [FILE_NAME_CONVENTION],
      source: {
        paths: () => names,
        readMany: (paths) => new Map(paths.map((file) => [file, ''])),
      },
    })[FILE_NAME_CONVENTION.id];

  it('follows the casing most files use and ignores names that fit several', () => {
    const detected = detect([
      'src/user-profile.ts',
      'src/userProfile.ts',
      'src/orderHistory.ts',
      'src/orderHistory.test.ts',
      'src/index.ts',
      'src/utils.ts',
      'src/Button.tsx',
      'vite.config.ts',
    ]);

    expect(detected).toEqual({
      choice: 'camelCase',
      source: 'majority',
      counts: { 'kebab-case': 1, camelCase: 3, PascalCase: 0, snake_case: 0 },
      files: 8,
    });
  });

  it('keeps the default when only ambiguous names exist', () => {
    const detected = detect(['src/index.ts', 'src/utils.ts', 'src/App.tsx']);

    expect(detected.choice).toBe('kebab-case');
    expect(detected.source).toBe('default');
  });

  it('adds only a non-default choice to the policy', () => {
    const choices = (names) =>
      conventionChoices({ [FILE_NAME_CONVENTION.id]: detect(names) }, [FILE_NAME_CONVENTION]);

    expect(choices(['src/a-b.ts', 'src/c-d.ts'])).toEqual({});
    expect(choices(['src/a_b.ts', 'src/c_d.ts'])).toEqual({
      'typescript.fileNames': 'snake_case',
    });
  });
});
