import { describe, expect, it } from 'vitest';
import { unformattedCheckstyle } from './unformatted-checks.mjs';

const GOOGLE = [
  '<module name="Checker">',
  '  <module name="FileTabCharacter">',
  '    <property name="eachLine" value="true"/>',
  '  </module>',
  '  <module name="TreeWalker">',
  '    <module name="OuterTypeFilename"/>',
  '    <module name="Indentation">',
  '      <property name="basicOffset" value="2"/>',
  '      <property name="braceAdjustment" value="2"/>',
  '      <property name="caseIndent" value="2"/>',
  '      <property name="throwsIndent" value="4"/>',
  '      <property name="lineWrappingIndentation" value="4"/>',
  '      <property name="arrayInitIndent" value="2"/>',
  '    </module>',
  '    <module name="Other">',
  '      <property name="basicOffset" value="2"/>',
  '    </module>',
  '  </module>',
  '</module>',
].join('\n');
const UNUSED_IMPORTS = '    <module name="UnusedImports"/>';

describe('unformattedCheckstyle', () => {
  it('adds the unused import check and keeps indentation at two spaces by default', () => {
    expect(unformattedCheckstyle(GOOGLE, '2')).toBe(
      GOOGLE.replace('<module name="TreeWalker">', `<module name="TreeWalker">\n${UNUSED_IMPORTS}`),
    );
  });

  it('checks indentation at four spaces, and only the offsets of the Indentation check', () => {
    expect(unformattedCheckstyle(GOOGLE, '4')).toBe(
      GOOGLE.replace('<module name="TreeWalker">', `<module name="TreeWalker">\n${UNUSED_IMPORTS}`)
        .replace(
          '"basicOffset" value="2"/>\n      <property name="braceAdjustment"',
          '"basicOffset" value="4"/>\n      <property name="braceAdjustment"',
        )
        .replace('"caseIndent" value="2"', '"caseIndent" value="4"')
        .replace('"arrayInitIndent" value="2"', '"arrayInitIndent" value="4"'),
    );
  });

  it('drops the indentation and tab checks when the files are indented with tabs', () => {
    expect(unformattedCheckstyle(GOOGLE, 'tab')).toBe(
      [
        '<module name="Checker">',
        '  ',
        '  <module name="TreeWalker">',
        UNUSED_IMPORTS,
        '    <module name="OuterTypeFilename"/>',
        '    ',
        '    <module name="Other">',
        '      <property name="basicOffset" value="2"/>',
        '    </module>',
        '  </module>',
        '</module>',
      ].join('\n'),
    );
  });

  it('says so when the bundled checks changed shape', () => {
    expect(() => unformattedCheckstyle('<module name="Checker"/>', '2')).toThrow(
      'nitpicker could not find TreeWalker in google_checks.xml',
    );
    expect(() =>
      unformattedCheckstyle('<module name="TreeWalker"><module name="Indentation"/></module>', '4'),
    ).toThrow('nitpicker could not find Indentation basicOffset in google_checks.xml');
  });
});
