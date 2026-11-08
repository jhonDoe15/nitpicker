import { describe, expect, it } from 'vitest';
import { conventionChoices, detectConventions } from '../../../shared/conventions/detect.mjs';
import {
  FILE_NAME_CONVENTION,
  fileNameRuleOptions,
  fileNameComplies,
  fittingCasings,
  folderCasing,
} from './file-name-casing.mjs';

const vote = (file) => FILE_NAME_CONVENTION.measure(undefined, file);

describe('file name casing votes', () => {
  it.each([
    ['src/user-profile.ts', 'kebab-case'],
    ['src/userProfile.ts', 'camelCase'],
    ['src/user_profile.ts', 'snake_case'],
    ['src/user-profile.test.ts', 'kebab-case'],
    ['src/userProfile.spec.mjs', 'camelCase'],
    ['src/use-session.tsx', 'kebab-case'],
    ['src/user-session.tsx', 'kebab-case'],
    ['src/userSession.tsx', 'camelCase'],
    ['src/user.ts', undefined],
    ['src/user-Profile.ts', undefined],
  ])('%s votes %s', (file, expected) => {
    expect(vote(file)).toBe(expected);
  });

  it.each([
    'src/index.ts',
    'src/utils.ts',
    'src/main.ts',
    'src/v2.ts',
    'src/2019.ts',
    'src/404.tsx',
    'src/500.tsx',
    'src/fr-CA.ts',
    'src/en_US.ts',
    'src/pt-br.ts',
    'src/foo.min.js',
    'src/x.test.ts',
    'src/y.d.ts',
    'app/page.tsx',
    'app/layout.tsx',
    'app/route.ts',
    'app/not-found.tsx',
    'app/global-error.tsx',
    'src/middleware.ts',
  ])('%s gives no vote', (file) => {
    expect(vote(file)).toBeUndefined();
  });

  it.each([
    'src/UserProfile.ts',
    'src/UserProfile.tsx',
    'src/UserProfile.test.tsx',
    'src/Button.ts',
    'src/Button.js',
    'src/ALLCAPS.ts',
  ])('%s is PascalCase and gives no vote', (file) => {
    expect(vote(file)).toBeUndefined();
  });

  it.each([
    'dist/chunk-3f9a1c2b.js',
    'src/main.3f9a1c2b.js',
    'src/vendor_9f8e7d6c5b.js',
    'src/__generated__/UserQuery.graphql.ts',
    'src/api/user.pb.ts',
    'src/queries/user_query.graphql.ts',
    'tests/fixtures/some_file.ts',
    'src/__fixtures__/other_file.ts',
  ])('%s is generated or a fixture and gives no vote', (file) => {
    expect(vote(file)).toBeUndefined();
  });

  it.each([
    'vite.config.ts',
    'lintStaged.config.mjs',
    'app/routes/[id].tsx',
    'app/routes/[...slug].tsx',
    'app/routes/posts_.$id.tsx',
    'app/routes/sitemap[.]xml.ts',
    'app/routes/_layout.tsx',
    'app/routes/+page.server.ts',
    'app/routes/$postId.tsx',
    'src/.eslintrc.js',
  ])('%s is framework syntax and gives no vote', (file) => {
    expect(vote(file)).toBeUndefined();
  });
});

describe('file name casing compliance', () => {
  const options = ['kebab-case', 'camelCase', 'snake_case'];

  it.each([
    'src/index.ts',
    'src/utils.ts',
    'src/2019.ts',
    'src/404.tsx',
    'src/500.tsx',
    'src/fr-CA.ts',
    'src/en_US.ts',
    'src/pt-br.ts',
    'src/foo.min.js',
    'src/x.test.ts',
    'src/y.d.ts',
    'app/page.tsx',
    'app/layout.tsx',
    'app/route.ts',
    'app/not-found.tsx',
    'app/global-error.tsx',
    'src/middleware.ts',
    'src/main.ts',
    'src/UserProfile.ts',
    'src/UserProfile.tsx',
    'src/Button.js',
    'dist/chunk-3f9a1c2b.js',
    'src/main.3f9a1c2b.js',
    'src/__generated__/UserQuery.graphql.ts',
    'tests/fixtures/some_file.ts',
    'vite.config.ts',
    'app/routes/[id].tsx',
    'app/routes/posts_.$id.tsx',
    'app/routes/sitemap[.]xml.ts',
    'app/routes/_app.tsx',
    'app/+layout.ts',
    'app/$id.ts',
  ])('%s complies with every casing', (file) => {
    expect(options.map((casing) => fileNameComplies(file, casing))).toEqual(
      options.map(() => true),
    );
  });

  it.each([
    ['src/user-profile.ts', 'kebab-case', true],
    ['src/user-profile.ts', 'camelCase', false],
    ['src/user-profile.ts', 'snake_case', false],
    ['src/userProfile.ts', 'kebab-case', false],
    ['src/userProfile.ts', 'camelCase', true],
    ['src/user_profile.ts', 'snake_case', true],
    ['src/user_profile.ts', 'kebab-case', false],
    ['src/user-Profile.ts', 'kebab-case', false],
    ['src\\userProfile.ts', 'camelCase', true],
  ])('%s under %s is %s', (file, casing, expected) => {
    expect(fileNameComplies(file, casing)).toBe(expected);
  });

  it('lists every casing a name fits', () => {
    expect(fittingCasings('utils')).toEqual(['kebab-case', 'camelCase', 'snake_case']);
    expect(fittingCasings('2019')).toEqual(['kebab-case', 'camelCase', 'snake_case']);
    expect(fittingCasings('user-Profile')).toEqual([]);
  });

  it('falls back to kebab-case until a convention is followed', () => {
    expect(fileNameRuleOptions()).toEqual({ casing: 'kebab-case' });
    expect(fileNameRuleOptions({ conventions: { 'typescript.fileNames': 'camelCase' } })).toEqual({
      casing: 'camelCase',
    });
  });

  it('marks a casing pinned in the config, even when it is the default', () => {
    expect(
      fileNameRuleOptions({ conventionPins: { 'typescript.fileNames': 'kebab-case' } }),
    ).toEqual({ casing: 'kebab-case', pinned: true });
  });
});

describe('hook files', () => {
  const hook = (name) => `export function ${name}() {\n  return 1;\n}\n`;
  const measure = (file, text) => FILE_NAME_CONVENTION.measure(text, file);

  it.each([
    ['src/useAuth.ts', hook('useAuth')],
    ['src/hooks/useSession.tsx', 'export const useSession = () => 1;\n'],
    ['src/useAuth.test.ts', hook('useAuth')],
    ['src/useAuth.ts', 'function useAuth() {}\nexport { useAuth };\n'],
    ['src/useAuth.ts', 'export default function useAuth() {}\n'],
    ['src/useAuth.ts', 'const useAuth = () => 1;\nexport default useAuth;\n'],
    ['src/useAuth.ts', 'export async function useAuth() {}\n'],
    ['src/useAuth.ts', undefined],
  ])('%s gives no vote and passes with %j', (file, text) => {
    expect(measure(file, text)).toBeUndefined();
    const casings = ['kebab-case', 'camelCase', 'snake_case'];
    expect(casings.map((casing) => fileNameComplies(file, casing, text))).toEqual(
      casings.map(() => true),
    );
  });

  it.each([
    ['src/useCase.ts', 'export const build = () => 1;\n'],
    ['src/useCase.ts', hook('useCaseBuilder')],
    ['src/useCase.ts', 'const useCase = 1;\n'],
    ['src/useCase.ts', '// export function useCase() {}\nexport const a = 1;\n'],
    ['src/useAuth.ts', hook('useSession')],
  ])('%s votes camelCase and is flagged in a kebab-case project with %j', (file, text) => {
    expect(measure(file, text)).toBe('camelCase');
    expect(fileNameComplies(file, 'kebab-case', text)).toBe(false);
    expect(fileNameComplies(file, 'camelCase', text)).toBe(true);
  });
});

describe('folder casing', () => {
  it('follows the plurality of at least three other voting files', () => {
    expect(folderCasing('src/a.ts', ['a-b.ts', 'c_d.ts', 'e_f.ts', 'g_h.ts'])).toBe('snake_case');
    expect(folderCasing('src/a-b.ts', ['a-b.ts', 'c_d.ts', 'e_f.ts'])).toBeUndefined();
  });

  it('ignores names that give no vote and files that are not code', () => {
    const names = ['index.ts', 'Button.tsx', 'a_b.ts', 'c_d.ts', 'e_f.json', 'g_h.md'];

    expect(folderCasing('src/x.ts', names)).toBeUndefined();
  });

  it('leaves a tie to the project casing', () => {
    expect(
      folderCasing('src/x.ts', ['a-b.ts', 'c-d.ts', 'e_f.ts', 'g_h.ts', 'iJ.ts', 'kL.ts']),
    ).toBeUndefined();
  });
});

describe('file name casing detection', () => {
  function detect(names, accepts, texts = {}) {
    const source = {
      paths: ({ unreadable = false } = {}) =>
        unreadable ? names : names.filter((name) => !name.includes('huge')),
      readMany: (paths) => {
        expect(paths).toEqual(Object.keys(texts));
        return new Map(paths.map((file) => [file, texts[file]]));
      },
    };
    return detectConventions({ definitions: [FILE_NAME_CONVENTION], source, accepts })[
      FILE_NAME_CONVENTION.id
    ];
  }

  it('follows the casing most files use and ignores names that fit several', () => {
    expect(
      detect([
        'src/user-profile.ts',
        'src/userProfile.ts',
        'src/orderHistory.ts',
        'src/orderHistory.test.ts',
        'src/index.ts',
        'src/utils.ts',
        'src/Button.tsx',
        'vite.config.ts',
      ]),
    ).toEqual({
      choice: 'camelCase',
      source: 'majority',
      counts: { 'kebab-case': 1, camelCase: 3, snake_case: 0 },
      files: 8,
    });
  });

  it('counts files too large to read, since a name needs no text', () => {
    const detected = detect(['src/a-b.ts', 'src/huge_one.ts', 'src/huge_two.ts']);

    expect(detected.choice).toBe('snake_case');
    expect(detected.counts).toEqual({ 'kebab-case': 1, camelCase: 0, snake_case: 2 });
  });

  it('measures only the files the caller accepts', () => {
    const detected = detect(
      ['src/a-b.ts', 'scripts/c_d.ts', 'scripts/e_f.ts'],
      (definition, file) => file.startsWith('src/'),
    );

    expect(detected.choice).toBe('kebab-case');
    expect(detected.files).toBe(1);
  });

  it('reads only hook-named files, to see whether they export the hook', () => {
    const detected = detect(
      ['src/useCase.ts', 'src/useAuth.ts', 'src/huge_hook.ts', 'src/useHuge.ts', 'src/a-b.ts'],
      undefined,
      {
        'src/useAuth.ts': 'export function useAuth() {}\n',
        'src/useCase.ts': 'export const build = 1;\n',
        'src/useHuge.ts': undefined,
      },
    );

    expect(detected.counts).toEqual({ 'kebab-case': 1, camelCase: 1, snake_case: 1 });
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
