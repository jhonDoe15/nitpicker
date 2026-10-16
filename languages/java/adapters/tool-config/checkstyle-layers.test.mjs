import { describe, expect, it } from 'vitest';
import { layerCheckstyle } from './checkstyle-layers.mjs';

const DOCTYPE =
  '<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN" "https://checkstyle.org/dtds/configuration_1_3.dtd">';
const HEADER = `<?xml version="1.0" encoding="UTF-8"?>\n${DOCTYPE}\n`;

const NITPICKER = `<?xml version="1.0"?>
${DOCTYPE}
<module name="Checker">
  <property name="severity" value="\${org.checkstyle.google.severity}" default="warning"/>
  <module name="SuppressionFilter">
    <property name="file" value="\${org.checkstyle.google.suppressionfilter.config}"/>
  </module>
  <module name="LineLength">
    <property name="max" value="100"/>
    <property name="ignorePattern" value="^import.*"/>
  </module>
  <module name="TreeWalker">
    <module name="AvoidStarImport"/>
    <module name="RightCurly">
      <property name="id" value="RightCurlySame"/>
      <property name="option" value="same"/>
    </module>
    <module name="RightCurly">
      <property name="id" value="RightCurlyAlone"/>
      <property name="option" value="alone"/>
    </module>
    <module name="Indentation">
      <property name="basicOffset" value="2"/>
    </module>
  </module>
</module>
`;

const PROJECT = `<?xml version="1.0"?>
${DOCTYPE}
<module name="Checker">
  <property name="severity" value="error"/>
  <property name="charset" value="UTF-8"/>
  <module name="SuppressWarningsFilter"/>
  <module name="SuppressionFilter">
    <property name="file" value="\${config_loc}/suppressions.xml"/>
  </module>
  <module name="LineLength">
    <property name="max" value="140"/>
  </module>
  <module name="TreeWalker">
    <module name="SuppressWarningsHolder"/>
    <module name="com.puppycrawl.tools.checkstyle.checks.indentation.IndentationCheck">
      <property name="basicOffset" value="4"/>
    </module>
    <module name="MagicNumber"/>
    <module name="RightCurly">
      <property name="id" value="RightCurlyAlone"/>
      <property name="option" value="alone_or_singleline"/>
    </module>
  </module>
</module>
`;

describe('layering the project Checkstyle config over nitpicker', () => {
  it('takes the properties the project sets and keeps every other module and property', () => {
    expect(layerCheckstyle({ nitpickerText: NITPICKER, projectText: PROJECT }))
      .toBe(`${HEADER}<module name="Checker">
  <property name="severity" value="error"/>
  <property name="charset" value="UTF-8"/>
  <module name="SuppressionFilter">
    <property name="file" value="\${org.checkstyle.google.suppressionfilter.config}"/>
  </module>
  <module name="LineLength">
    <property name="max" value="140"/>
    <property name="ignorePattern" value="^import.*"/>
  </module>
  <module name="TreeWalker">
    <module name="AvoidStarImport"/>
    <module name="RightCurly">
      <property name="id" value="RightCurlySame"/>
      <property name="option" value="same"/>
    </module>
    <module name="RightCurly">
      <property name="id" value="RightCurlyAlone"/>
      <property name="option" value="alone_or_singleline"/>
    </module>
    <module name="Indentation">
      <property name="basicOffset" value="4"/>
    </module>
    <module name="MagicNumber"/>
  </module>
  <module name="SuppressionFilter">
    <property name="file" value="\${config_loc}/suppressions.xml"/>
  </module>
</module>
`);
  });

  it('lets nitpicker keep the properties it sets when nitpicker is first', () => {
    const merged = layerCheckstyle({
      nitpickerText: NITPICKER,
      projectText: PROJECT,
      projectWins: false,
    });

    expect(
      merged.split('\n').filter((line) => /severity|"max"|basicOffset|option/.test(line)),
    ).toEqual([
      '  <property name="severity" value="${org.checkstyle.google.severity}" default="warning"/>',
      '    <property name="max" value="100"/>',
      '      <property name="option" value="same"/>',
      '      <property name="option" value="alone"/>',
      '      <property name="basicOffset" value="2"/>',
    ]);
  });

  it('keeps a project module with no id apart when nitpicker has several of that name', () => {
    const project = PROJECT.replace(' <property name="id" value="RightCurlyAlone"/>', '');

    const merged = layerCheckstyle({ nitpickerText: NITPICKER, projectText: project });

    expect(merged.split('\n').filter((line) => /RightCurly|id"/.test(line))).toEqual([
      '    <module name="RightCurly">',
      '      <property name="id" value="RightCurlySame"/>',
      '    <module name="RightCurly">',
      '      <property name="id" value="RightCurlyAlone"/>',
      '    <module name="RightCurly">',
    ]);
  });

  it('refuses a config that does not start at the Checker', () => {
    expect(() =>
      layerCheckstyle({ nitpickerText: NITPICKER, projectText: '<module name="TreeWalker"/>' }),
    ).toThrow('The Checkstyle config must have a Checker module at its root, not TreeWalker');
  });
});
