import { describe, expect, it } from 'vitest';
import { languageLevel, lintCompatible } from './javac-options.mjs';

const NO_SETTINGS = { release: undefined, source: undefined, target: undefined, args: [] };

describe('lintCompatible', () => {
  it.each([
    '-Xmaxwarns',
    '-Xmaxerrs',
    '-processor',
    '-processorpath',
    '--processor-path',
    '--processor-module-path',
    '--module-path',
    '-p',
    '-d',
    '-s',
    '-h',
    '-encoding',
    '-cp',
    '-classpath',
    '--class-path',
    '-sourcepath',
    '--source-path',
  ])('drops %s and its value', (option) => {
    expect(lintCompatible(['-parameters', option, 'value', '--enable-preview'])).toEqual([
      '-parameters',
      '--enable-preview',
    ]);
  });

  it.each([
    '-Werror',
    '-Xlint:all',
    '-Xdoclint:none',
    '-proc:full',
    '-implicit:class',
    '-Xplugin:ErrorProne',
    '-J-Xmx2g',
    '--processor-path=/p.jar',
    '--processor-module-path=/p',
    '--module-path=/mods',
    '--class-path=/lib.jar',
    '--source-path=/src',
  ])('drops %s', (option) => {
    expect(lintCompatible(['-parameters', option, '--enable-preview'])).toEqual([
      '-parameters',
      '--enable-preview',
    ]);
  });
});

describe('languageLevel', () => {
  it.each([
    ['the release', { ...NO_SETTINGS, release: '17', source: '11' }, ['--release', '17']],
    ['nothing when the arguments give a release', { ...NO_SETTINGS, args: ['--release=21'] }, []],
    [
      'source and target',
      { ...NO_SETTINGS, source: '1.8', target: '1.8' },
      ['-source', '1.8', '-target', '1.8'],
    ],
    [
      'what the arguments leave out',
      { ...NO_SETTINGS, source: '11', target: '11', args: ['-source', '11'] },
      ['-target', '11'],
    ],
    [
      'the compiler plug-in default when the POM sets no level',
      NO_SETTINGS,
      ['-source', '8', '-target', '8'],
    ],
    [
      'nothing for a level the arguments set with an equals sign',
      { ...NO_SETTINGS, args: ['--source=17', '--target=17'] },
      [],
    ],
  ])('passes %s', (_, compiler, expected) => {
    expect(languageLevel(compiler)).toEqual(expected);
  });
});
