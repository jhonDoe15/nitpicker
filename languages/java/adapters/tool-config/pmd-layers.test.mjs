import { describe, expect, it } from 'vitest';
import { layerPmdRulesets } from './pmd-layers.mjs';

const NITPICKER = `<?xml version="1.0"?>
<ruleset name="nitpicker" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>n</description>
  <rule ref="category/java/errorprone.xml">
    <exclude name="AvoidLiteralsInIfCondition"/>
  </rule>
  <rule ref="category/java/errorprone.xml/AvoidLiteralsInIfCondition">
    <properties><property name="ignoreMagicNumbers" value="0,1"/></properties>
  </rule>
  <rule ref="category/java/bestpractices.xml">
    <exclude name="UnitTestShouldIncludeAssert"/>
  </rule>
  <rule ref="category/java/bestpractices.xml/UnitTestShouldIncludeAssert">
    <properties><property name="extraAssertMethodNames" value="andExpect,verifyComplete"/></properties>
  </rule>
  <rule name="OwnRule" language="java" class="net.sourceforge.pmd.lang.rule.xpath.XPathRule">
    <properties><property name="xpath"><value><![CDATA[//A[@B < 1]]]></value></property></properties>
  </rule>
  <rule ref="category/java/design.xml/AvoidCatchingGenericException"/>
</ruleset>
`;
const PROJECT = `<?xml version="1.0"?>
<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>p</description>
  <exclude-pattern>.*/generated/.*</exclude-pattern>
  <rule ref="category/java/errorprone.xml"/>
  <rule ref="category/java/design.xml"><exclude name="LawOfDemeter"/></rule>
  <rule ref="category/java/codestyle.xml"/>
  <rule ref="category/java/errorprone.xml/AvoidLiteralsInIfCondition">
    <properties><property name="ignoreMagicNumbers" value="0,1,7"/></properties>
  </rule>
  <rule name="OwnRule" language="java" class="net.sourceforge.pmd.lang.rule.xpath.XPathRule">
    <priority>1</priority>
  </rule>
  <rule ref="category/java/performance.xml/AvoidArrayLoops"/>
</ruleset>
`;
const HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const NITPICKER_PATH = '/nitpicker/pmd-ruleset.xml';

const layer = (options) =>
  layerPmdRulesets({ nitpickerPath: NITPICKER_PATH, nitpickerText: NITPICKER, ...options });

describe('layering the project ruleset over nitpicker', () => {
  it('replaces the rules the project names and keeps nitpicker for the rest', () => {
    const { nitpicker, project, replaced } = layer({ projectText: PROJECT });

    expect(replaced).toEqual(['AvoidLiteralsInIfCondition', 'OwnRule']);
    expect(nitpicker)
      .toBe(`${HEADER}<ruleset name="nitpicker" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>Nitpicker's PMD rules, without the rules the project's ruleset sets itself.</description>
  <rule ref="/nitpicker/pmd-ruleset.xml">
    <exclude name="AvoidLiteralsInIfCondition"/>
    <exclude name="OwnRule"/>
  </rule>
</ruleset>
`);
    expect(project)
      .toBe(`${HEADER}<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>p</description>
  <exclude-pattern>.*/generated/.*</exclude-pattern>
  <rule ref="category/java/design.xml">
    <exclude name="LawOfDemeter"/>
    <exclude name="AvoidCatchingGenericException"/>
  </rule>
  <rule ref="category/java/codestyle.xml"/>
  <rule ref="category/java/errorprone.xml/AvoidLiteralsInIfCondition">
    <properties>
      <property name="ignoreMagicNumbers" value="0,1,7"/>
    </properties>
  </rule>
  <rule name="OwnRule" language="java" class="net.sourceforge.pmd.lang.rule.xpath.XPathRule">
    <priority>1</priority>
  </rule>
  <rule ref="category/java/performance.xml/AvoidArrayLoops"/>
</ruleset>
`);
  });

  it('lets nitpicker win where both name a rule when nitpicker is first', () => {
    const { nitpicker, project, replaced } = layer({ projectText: PROJECT, projectWins: false });

    expect(replaced).toEqual([]);
    expect(nitpicker)
      .toBe(`${HEADER}<ruleset name="nitpicker" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>Nitpicker's PMD rules, without the rules the project's ruleset sets itself.</description>
  <rule ref="/nitpicker/pmd-ruleset.xml"/>
</ruleset>
`);
    expect(project)
      .toBe(`${HEADER}<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>p</description>
  <exclude-pattern>.*/generated/.*</exclude-pattern>
  <rule ref="category/java/design.xml">
    <exclude name="LawOfDemeter"/>
    <exclude name="AvoidCatchingGenericException"/>
  </rule>
  <rule ref="category/java/codestyle.xml"/>
  <rule ref="category/java/performance.xml/AvoidArrayLoops"/>
</ruleset>
`);
  });

  it('adds the assertion helpers to the list nitpicker sets, once', () => {
    const { nitpicker, project } = layer({ assertionHelpers: ['verifyComplete', 'expectOk'] });

    expect(project).toBeUndefined();
    expect(nitpicker)
      .toBe(`${HEADER}<ruleset name="nitpicker" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>Nitpicker's PMD rules, without the rules the project's ruleset sets itself.</description>
  <rule ref="/nitpicker/pmd-ruleset.xml">
    <exclude name="UnitTestShouldIncludeAssert"/>
  </rule>
  <rule ref="category/java/bestpractices.xml/UnitTestShouldIncludeAssert">
    <properties>
      <property name="extraAssertMethodNames" value="andExpect,verifyComplete,expectOk"/>
    </properties>
  </rule>
</ruleset>
`);
  });

  it('leaves the assertion rule to the project when the project names it', () => {
    const projectText = PROJECT.replace(
      'category/java/performance.xml/AvoidArrayLoops',
      'category/java/bestpractices.xml/UnitTestShouldIncludeAssert',
    );

    const { nitpicker, replaced } = layer({ projectText, assertionHelpers: ['expectOk'] });

    expect(replaced).toEqual([
      'AvoidLiteralsInIfCondition',
      'OwnRule',
      'UnitTestShouldIncludeAssert',
    ]);
    expect(nitpicker)
      .toBe(`${HEADER}<ruleset name="nitpicker" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>Nitpicker's PMD rules, without the rules the project's ruleset sets itself.</description>
  <rule ref="/nitpicker/pmd-ruleset.xml">
    <exclude name="AvoidLiteralsInIfCondition"/>
    <exclude name="OwnRule"/>
    <exclude name="UnitTestShouldIncludeAssert"/>
  </rule>
</ruleset>
`);
  });
});
