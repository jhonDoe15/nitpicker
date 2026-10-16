import { afterEach, describe, expect, it } from 'vitest';
import { resolveLayout } from '../../layout.mjs';
import {
  analyzedProjectRoot,
  isReactProject,
  reactScopeConfigFor,
  stylingApproachFor,
} from './react-scope.mjs';
import { createProjects, manifestWith } from './test-support/projects.mjs';

const layout = resolveLayout();
const { cleanup, projectWith } = createProjects();

afterEach(cleanup);

describe('React detection', () => {
  it.each([
    ['dependencies', { dependencies: { react: '19.0.0' } }],
    ['devDependencies', { devDependencies: { react: '19.0.0' } }],
    ['both', { dependencies: { react: '19.0.0' }, devDependencies: { react: '19.0.0' } }],
  ])('turns on when react is in %s', (_name, fields) => {
    const projectRoot = projectWith(manifestWith(fields));

    expect(isReactProject({ projectRoot })).toBe(true);
  });

  it.each([
    ['no manifest', undefined],
    ['a manifest without dependencies', manifestWith({})],
    ['other dependencies only', manifestWith({ dependencies: { preact: '10.0.0' } })],
    ['react only as a peer dependency', manifestWith({ peerDependencies: { react: '19.0.0' } })],
    ['react-dom without react', manifestWith({ dependencies: { 'react-dom': '19.0.0' } })],
    ['a malformed manifest', '{ not json'],
    ['a manifest that is JSON null', 'null'],
    ['a manifest that is a JSON number', '5'],
  ])('stays off with %s', (_name, manifest) => {
    const projectRoot = projectWith(manifest);

    expect(isReactProject({ projectRoot })).toBe(false);
  });

  it('lets the config switch the scope on or off whatever package.json says', () => {
    const withReact = projectWith(manifestWith({ dependencies: { react: '19.0.0' } }));
    const withoutReact = projectWith(manifestWith({}));

    expect(isReactProject({ projectRoot: withReact, react: { enabled: false } })).toBe(false);
    expect(isReactProject({ projectRoot: withoutReact, react: { enabled: true } })).toBe(true);
    expect(isReactProject({ projectRoot: withReact, react: { styling: 'css-in-js' } })).toBe(true);
    expect(isReactProject({ projectRoot: withoutReact, react: {} })).toBe(false);
  });

  it('reads the analyzed project from the ESLint wrapper environment, else the working directory', () => {
    expect(analyzedProjectRoot({ NITPICKER_DIFF_ESLINT_PROJECT_ROOT: '/analyzed' })).toBe(
      '/analyzed',
    );
    expect(analyzedProjectRoot({})).toBe(process.cwd());
  });
});

describe('the styling approach', () => {
  it.each([
    ['styled-components', { dependencies: { 'styled-components': '6.0.0' } }],
    ['an @emotion package', { devDependencies: { '@emotion/react': '11.0.0' } }],
    ['another CSS-in-JS library', { dependencies: { goober: '2.0.0' } }],
  ])('is css-in-js when the manifest lists %s', (_name, fields) => {
    const projectRoot = projectWith(manifestWith({ dependencies: { react: '19.0.0' }, ...fields }));

    expect(stylingApproachFor({ projectRoot })).toBe('css-in-js');
  });

  it.each([
    [
      'no CSS-in-JS dependency',
      manifestWith({ dependencies: { react: '19.0.0', tailwindcss: '4.0.0' } }),
    ],
    [
      'a similarly named package',
      manifestWith({ dependencies: { 'styled-components-extra': '1.0.0' } }),
    ],
    ['no manifest', undefined],
  ])('is class-names with %s', (_name, manifest) => {
    expect(stylingApproachFor({ projectRoot: projectWith(manifest) })).toBe('class-names');
  });

  it('lets the config override what the manifest suggests', () => {
    const projectRoot = projectWith(
      manifestWith({ dependencies: { 'styled-components': '6.0.0' } }),
    );

    expect(stylingApproachFor({ projectRoot, react: { styling: 'inline-style' } })).toBe(
      'inline-style',
    );
    expect(stylingApproachFor({ projectRoot, react: { enabled: true } })).toBe('css-in-js');
  });

  it('reaches the styling rule through the scope config', async () => {
    const projectRoot = projectWith(
      manifestWith({ dependencies: { '@emotion/styled': '11.0.0' } }),
    );

    const [entry] = await reactScopeConfigFor(layout, {}, projectRoot);

    expect(entry.rules['nitpicker/react-single-styling-approach']).toEqual([
      'error',
      { approach: 'css-in-js' },
    ]);
  });
});
