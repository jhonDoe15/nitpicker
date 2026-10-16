import { describe, expect, it } from 'vitest';
import {
  bothSides,
  exceptionFor,
  newFindings,
  reactFiles,
  rows,
  ruleFindings,
} from '../../test-support/reuse-project.mjs';

const iconFindings = ruleFindings('new-icon-asset');

const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>\n';
const withLucide = (files) => reactFiles(files, { 'lucide-react': '1.0.0' });
const sized = (viewBox) => `<svg viewBox="${viewBox}"></svg>\n`;

describe('new-icon-asset', () => {
  it('reports an icon-sized svg under the source roots and names the icon package', () => {
    const findings = iconFindings(withLucide({ 'src/assets/arrow.svg': icon }));

    expect(findings.map(({ path, identity }) => [path, identity])).toEqual([
      ['src/assets/arrow.svg', 'new-icon-asset'],
    ]);
    expect(findings[0].message).toBe(
      [
        'Use an icon from lucide-react instead of adding src/assets/arrow.svg.',
        `If this is intended, add ${exceptionFor('new-icon-asset', 'src/assets/arrow.svg')}`,
        'to "exceptions" in nitpicker.config.json.',
      ].join(' '),
    );
  });

  it('names the first icon package in package.json', () => {
    const files = reactFiles(
      { 'src/a.svg': icon },
      { 'react-icons': '5.0.0', 'lucide-react': '1.0.0' },
    );

    expect(iconFindings(files)[0].message).toMatch(/^Use an icon from react-icons instead/u);
  });

  it.each([
    ['@heroicons/react'],
    ['@mui/icons-material'],
    ['@tabler/icons-react'],
    ['@phosphor-icons/react'],
    ['@fortawesome/react-fontawesome'],
    ['@expo/vector-icons'],
  ])('knows %s as an icon package', (name) => {
    expect(iconFindings(reactFiles({ 'src/a.svg': icon }, { [name]: '1.0.0' }))).toHaveLength(1);
  });

  it('counts only icon-sized svgs: a viewBox, or else a width or height, of 48 or less', () => {
    const files = withLucide({
      'src/small.svg': sized('0 0 24 24'),
      'src/edge.svg': sized('0 0 48 48'),
      'src/wide.svg': sized('0 0 120 24'),
      'src/tall.svg': sized('0 0 24 120'),
      'src/hero.svg': sized('0 0 512 512'),
      'src/sized.svg': '<svg width="16" height="16"></svg>',
      'src/large.svg': '<svg width="300px" height="200px"></svg>',
      'src/sprite.svg': '<svg><symbol id="a" viewBox="0 0 24 24"></symbol></svg>',
    });

    expect(rows(iconFindings(files)).map(([, file]) => file)).toEqual([
      'src/edge.svg',
      'src/sized.svg',
      'src/small.svg',
    ]);
  });

  it('skips framework icon conventions, logos and brand marks, and matches the extension in any case', () => {
    const files = withLucide({
      'src/app/icon.svg': icon,
      'src/app/favicon.svg': icon,
      'src/app/apple-icon.svg': icon,
      'src/app/logo.svg': icon,
      'src/app/acme-logo.svg': icon,
      'src/app/brand-mark.svg': icon,
      'src/app/ARROW.SVG': icon,
      'src/app/my-icon.svg': icon,
    });

    expect(rows(iconFindings(files)).map(([, file]) => file)).toEqual([
      'src/app/ARROW.SVG',
      'src/app/my-icon.svg',
    ]);
  });

  it('needs an icon package and the React scope', () => {
    const files = { 'src/a.svg': icon };

    expect(iconFindings(reactFiles(files))).toEqual([]);
    expect(iconFindings(reactFiles(files, { 'left-pad': '1.0.0' }))).toEqual([]);
    expect(
      iconFindings({
        'package.json': JSON.stringify({ dependencies: { 'lucide-react': '1' } }),
        ...files,
      }),
    ).toEqual([]);
    expect(iconFindings(withLucide(files), { react: { enabled: false } })).toEqual([]);
  });

  it('takes the React scope and the icon package from the head policy', () => {
    const files = { 'package.json': '{}', 'src/a.svg': icon };
    const head = { react: { enabled: true, iconPackage: 'lucide-react' } };

    expect(rows(iconFindings(files, head))).toEqual([
      ['new-icon-asset', 'src/a.svg', 'new-icon-asset'],
    ]);
  });

  it('looks in the source roots only, skipping test, fixture, story and excluded folders', () => {
    const files = withLucide({
      'src/a.svg': icon,
      'src/__tests__/d.svg': icon,
      'src/__fixtures__/e.svg': icon,
      'src/fixtures/e.svg': icon,
      'src/__mocks__/e.svg': icon,
      'src/stories/assets/e.svg': icon,
      'src/vendor/f.svg': icon,
      'public/g.svg': icon,
      'src/h.png': 'x',
    });

    expect(rows(iconFindings(files, { exclude: ['src/vendor/**'] }))).toEqual([
      ['new-icon-asset', 'src/a.svg', 'new-icon-asset'],
    ]);
    expect(
      rows(iconFindings(withLucide({ 'src/dist/b.svg': icon, 'src/generated/c.svg': icon }))),
    ).toEqual([
      ['new-icon-asset', 'src/dist/b.svg', 'new-icon-asset'],
      ['new-icon-asset', 'src/generated/c.svg', 'new-icon-asset'],
    ]);
    expect(rows(iconFindings(files, { layout: { sourceRoots: ['public'] } }))).toEqual([
      ['new-icon-asset', 'public/g.svg', 'new-icon-asset'],
    ]);
  });

  it('checks an svg named like generated output, since only code files carry a generator marker', () => {
    const files = withLucide({ 'src/__generated__/c.svg': icon, 'src/c.generated.svg': icon });

    expect(rows(iconFindings(files))).toEqual([
      ['new-icon-asset', 'src/__generated__/c.svg', 'new-icon-asset'],
      ['new-icon-asset', 'src/c.generated.svg', 'new-icon-asset'],
    ]);
  });

  it('is lifted by an exception for the file', () => {
    const exception = { rule: 'new-icon-asset', paths: ['src/brand/**'], reason: 'Brand artwork' };

    expect(
      rows(
        iconFindings(withLucide({ 'src/brand/logo.svg': icon, 'src/arrow.svg': icon }), {
          exceptions: [exception],
        }),
      ),
    ).toEqual([['new-icon-asset', 'src/arrow.svg', 'new-icon-asset']]);
  });
});

describe('new-icon-asset across a pull request', () => {
  const baseFiles = { 'package.json': '{}', 'src/old.svg': icon };

  it('does not flag existing svgs when the pull request adds the icon package', () => {
    const headFiles = { ...withLucide({}), 'src/old.svg': icon };
    const sides = bothSides(baseFiles, headFiles);

    expect(rows(sides.base)).toEqual(rows(sides.head));
    expect(newFindings(sides)).toEqual([]);
  });

  it('flags an svg the pull request adds once the icon package is there', () => {
    const headFiles = { ...withLucide({ 'src/new.svg': icon }), 'src/old.svg': icon };

    expect(rows(newFindings(bothSides(baseFiles, headFiles)))).toEqual([
      ['new-icon-asset', 'src/new.svg', 'new-icon-asset'],
    ]);
  });

  it('does not flag existing svgs when the pull request adds React', () => {
    const iconsOnly = { 'package.json': JSON.stringify({ dependencies: { 'lucide-react': '1' } }) };
    const headFiles = { ...withLucide({}), 'src/old.svg': icon };
    const sides = bothSides({ ...iconsOnly, 'src/old.svg': icon }, headFiles);

    expect(rows(sides.base)).toEqual(rows(sides.head));
    expect(newFindings(sides)).toEqual([]);
  });

  it('does not flag svgs when the pull request removes the icon package', () => {
    const headFiles = { 'package.json': '{}', 'src/old.svg': icon };
    const sides = bothSides({ ...withLucide({}), 'src/old.svg': icon }, headFiles);

    expect(sides.base).toEqual([]);
    expect(sides.head).toEqual([]);
  });
});
