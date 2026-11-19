import { describe, expect, it } from 'vitest';
import { resolveHeadPolicy as untypedResolveHeadPolicy } from '../head-policy.mjs';
import { useTemporaryProjects } from '../test-support/temporary-projects.mts';

type Section = Readonly<Record<string, unknown>>;

const resolveHeadPolicy: (
  config: object,
  projectRoot: string,
) => { readonly react: Section; readonly frameworks: Section } = untypedResolveHeadPolicy;

const { projectWith: filesIn } = useTemporaryProjects('nitpicker-head-policy-react-');

function manifestProject(manifest: object, files: Readonly<Record<string, string>> = {}) {
  return filesIn({ 'package.json': JSON.stringify(manifest), ...files });
}

function dependenciesProject(dependencies: Readonly<Record<string, string>>) {
  return manifestProject({ dependencies });
}

describe('head policy icon package', () => {
  it('records the first icon package of the head checkout next to the React scope', () => {
    const root = dependenciesProject({
      react: '19.0.0',
      'react-icons': '5.0.0',
      'lucide-react': '1.0.0',
    });

    expect(resolveHeadPolicy({}, root).react).toEqual({
      enabled: true,
      iconPackage: 'react-icons',
      major: 19,
      styling: 'class-names',
      autoCleanup: true,
    });
  });

  it('leaves the key out when the head checkout has no icon package', () => {
    const root = dependenciesProject({ react: '19.0.0' });

    expect(resolveHeadPolicy({}, root).react).toEqual({
      enabled: true,
      major: 19,
      styling: 'class-names',
      autoCleanup: true,
    });
  });
});

describe('head policy React major version', () => {
  it('records the installed major of the head checkout over its declared range', () => {
    const root = manifestProject(
      { dependencies: { react: '^19.0.0' } },
      { 'node_modules/react/package.json': JSON.stringify({ version: '18.3.1' }) },
    );

    expect(resolveHeadPolicy({}, root).react['major']).toBe(18);
  });

  it('leaves the major out when React is off or its version is unreadable', () => {
    expect(resolveHeadPolicy({}, dependenciesProject({})).react).toEqual({ enabled: false });
    expect(resolveHeadPolicy({}, dependenciesProject({ react: 'latest' })).react).toEqual({
      enabled: true,
      styling: 'class-names',
      autoCleanup: true,
    });
  });
});

describe('head policy styling approach', () => {
  function stylingOf(
    manifest: object,
    files: Readonly<Record<string, string>>,
    config: object = {},
  ) {
    return resolveHeadPolicy(config, manifestProject(manifest, files)).react['styling'];
  }

  const cssModules =
    "import styles from './card.module.css';\nexport const C = () => <p className={styles.c} />;\n";
  const styled =
    "import styled from '@emotion/styled';\nexport const Box = styled.div`color: red;`;\n";
  const muiAndEmotion = {
    dependencies: { react: '19.0.0', '@mui/material': '7.0.0', '@emotion/react': '11.0.0' },
  };

  it('follows what most head source files use, not which libraries are installed', () => {
    const files = {
      'src/a.tsx': cssModules,
      'src/b.tsx': cssModules,
      'src/c.tsx': styled,
      'src/a.test.tsx': styled,
      'src/d.test.tsx': styled,
    };

    expect(stylingOf(muiAndEmotion, files)).toBe('class-names');
    expect(
      stylingOf(muiAndEmotion, {
        'src/a.tsx': styled,
        'src/b.tsx': cssModules,
        'src/c.tsx': styled,
      }),
    ).toBe('css-in-js');
  });

  it('falls back to the dependencies without styled source and lets the config decide', () => {
    expect(stylingOf(muiAndEmotion, {})).toBe('css-in-js');
    expect(stylingOf({ dependencies: { react: '19.0.0', expo: '54.0.0' } }, {})).toBe(
      'style-sheet',
    );
    expect(
      stylingOf(muiAndEmotion, { 'src/a.tsx': styled }, { react: { styling: 'inline-style' } }),
    ).toBe('inline-style');
  });
});

describe('head policy test cleanup', () => {
  function autoCleanupOf(
    devDependencies: Readonly<Record<string, string>>,
    config: string | undefined,
  ) {
    const root = manifestProject(
      { dependencies: { react: '19.0.0' }, devDependencies },
      config === undefined ? {} : { 'vitest.config.ts': config },
    );
    return resolveHeadPolicy({}, root).react['autoCleanup'];
  }

  it('records whether Testing Library unmounts after each test without a setup call', () => {
    const vitest = { vitest: '4.0.0' };

    expect(autoCleanupOf(vitest, 'export default { test: { environment: "jsdom" } };')).toBe(false);
    expect(autoCleanupOf(vitest, 'export default { test: { globals: false } };')).toBe(false);
    expect(autoCleanupOf(vitest, undefined)).toBe(false);
    expect(autoCleanupOf(vitest, 'export default { test: { globals: true } };')).toBe(true);
    expect(autoCleanupOf({ jest: '30.0.0' }, undefined)).toBe(true);
  });

  it('follows the runner: node:test has no global afterEach, Mocha has one', () => {
    function withScript(test: string) {
      const root = manifestProject({ scripts: { test }, dependencies: { react: '19.0.0' } });
      return resolveHeadPolicy({}, root).react['autoCleanup'];
    }

    expect(withScript('node --test')).toBe(false);
    expect(withScript('mocha')).toBe(true);
    expect(withScript('jest')).toBe(true);
    expect(autoCleanupOf({}, undefined)).toBe(true);
  });
});

describe('head policy framework conventions', () => {
  function projectWith(manifest: object, files: Readonly<Record<string, string>> = {}) {
    return resolveHeadPolicy({}, manifestProject(manifest, files)).frameworks;
  }

  const nextFiles = [
    '{app,src/app}/**/{page,layout,loading,error,global-error,not-found,template,default,route,forbidden,unauthorized,sitemap,robots,manifest,icon,apple-icon,opengraph-image,twitter-image}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    '{pages,src/pages}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    '{middleware,src/middleware,proxy,src/proxy}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  ];
  const reactRouterFiles = [
    'app/{root,routes,entry.client,entry.server}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    'app/routes/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  ];
  const storyFiles = ['**/*.{stories,story}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];
  const expoFiles = ['{app,src/app}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];

  it.each([
    ['Next.js from its dependency', { dependencies: { next: '15.0.0' } }, {}, nextFiles],
    ['Next.js from its config file', {}, { 'next.config.mjs': 'export default {};' }, nextFiles],
    [
      'Storybook from a package',
      { devDependencies: { '@storybook/react': '9.0.0' } },
      {},
      storyFiles,
    ],
    ['Storybook from its folder', {}, { '.storybook/main.ts': 'export default {};' }, storyFiles],
    ['Expo Router', { dependencies: { 'expo-router': '6.0.0' } }, {}, expoFiles],
    [
      'React Router from its dev package',
      { devDependencies: { '@react-router/dev': '7.9.0' } },
      {},
      reactRouterFiles,
    ],
    ['Remix', { dependencies: { '@remix-run/react': '2.0.0' } }, {}, reactRouterFiles],
    [
      'React Router from its config file',
      {},
      { 'react-router.config.ts': 'export default {};' },
      reactRouterFiles,
    ],
  ])('allows the default exports of %s', (_name, manifest, files, defaultExports) => {
    expect(projectWith(manifest, files)).toEqual({ defaultExports, entryPoints: [] });
  });

  it.each([
    [
      'the module script of index.html',
      {
        'index.html':
          '<script src="/src/boot.tsx?v=1" type="module"></script><script src="/x.js"></script>',
      },
      ['src/boot.tsx'],
    ],
    ['the conventional src/main.tsx', { 'src/main.tsx': 'export {};' }, ['src/main.tsx']],
    ['no entry it can find', {}, []],
  ])('takes the Vite entry from %s', (_name, files, entryPoints) => {
    const frameworks = projectWith({ devDependencies: { vite: '7.0.0' } }, files);

    expect(frameworks).toEqual(
      entryPoints.length === 0 ? undefined : { defaultExports: [], entryPoints },
    );
  });

  it('records nothing for a project without those frameworks', () => {
    expect(projectWith({ dependencies: { react: '19.0.0' } }, { 'src/main.tsx': '' })).toBe(
      undefined,
    );
  });
});
