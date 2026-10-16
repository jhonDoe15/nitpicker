import { afterEach, describe, expect, it } from 'vitest';
import { resolveLayout } from '../../layout.mjs';
import { reactScopeConfigFor, stylingApproachFor } from './react-scope.mjs';
import { manifestWith, temporaryProjects } from './test-support/react-projects.mjs';

const layout = resolveLayout();
const { projectWith, removeProjects } = temporaryProjects();

afterEach(removeProjects);

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

  it.each([
    ['react-native', { dependencies: { 'react-native': '0.81.0' } }],
    ['expo', { dependencies: { expo: '54.0.0' } }],
  ])('is style-sheet for a React Native app that lists %s', (_name, fields) => {
    expect(stylingApproachFor({ projectRoot: projectWith(manifestWith(fields)) })).toBe(
      'style-sheet',
    );
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
