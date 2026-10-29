import { describe, expect, it } from 'vitest';
import { layerPmdRulesets } from './pmd-layers.mjs';

const NITPICKER = `<?xml version="1.0"?>
<ruleset name="nitpicker" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>n</description>
  <rule ref="category/java/errorprone.xml">
    <exclude name="AvoidLiteralsInIfCondition"/>
    <exclude name="TestClassWithoutTestCases"/>
  </rule>
  <rule ref="category/java/errorprone.xml/AvoidLiteralsInIfCondition" message="Name this number.">
    <priority>2</priority>
    <properties>
      <property name="ignoreMagicNumbers" value="0,1"/>
      <property name="ignoreExpressions" value="true"/>
    </properties>
  </rule>
  <rule ref="category/java/bestpractices.xml">
    <exclude name="UnitTestShouldIncludeAssert"/>
  </rule>
  <rule ref="category/java/bestpractices.xml/UnitTestShouldIncludeAssert">
    <properties><property name="extraAssertMethodNames" value="andExpect,verifyComplete"/></properties>
  </rule>
  <rule name="OwnRule" language="java" class="net.sourceforge.pmd.lang.rule.xpath.XPathRule"
        message="Own message.">
    <description>Own description.</description>
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
const TESTS = `<?xml version="1.0"?>
<ruleset name="tests" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>t</description>
  <rule ref="category/java/errorprone.xml/TestClassWithoutTestCases">
    <properties><property name="testClassPattern" value="Test.*"/></properties>
  </rule>
</ruleset>
`;
const MAIN = `<?xml version="1.0"?>
<ruleset name="main" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>m</description>
  <rule ref="category/java/security.xml"/>
</ruleset>
`;
const HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const NITPICKER_PATH = '/nitpicker/pmd-ruleset.xml';

const layer = (options) =>
  layerPmdRulesets({
    nitpickerPath: NITPICKER_PATH,
    nitpickerText: NITPICKER,
    testText: TESTS,
    mainPath: '/nitpicker/pmd-main-ruleset.xml',
    mainText: MAIN,
    ...options,
  });

describe('layering the project ruleset over nitpicker', () => {
  it('overlays the project rules on nitpicker definitions and keeps the rest of nitpicker', () => {
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
  <rule ref="category/java/errorprone.xml/AvoidLiteralsInIfCondition" message="Name this number.">
    <priority>2</priority>
    <properties>
      <property name="ignoreExpressions" value="true"/>
      <property name="ignoreMagicNumbers" value="0,1,7"/>
    </properties>
  </rule>
  <rule name="OwnRule" language="java" class="net.sourceforge.pmd.lang.rule.xpath.XPathRule" message="Own message.">
    <description>Own description.</description>
    <priority>1</priority>
    <properties>
      <property name="xpath">
        <value>//A[@B &lt; 1]</value>
      </property>
    </properties>
  </rule>
  <rule ref="category/java/performance.xml/AvoidArrayLoops"/>
</ruleset>
`);
  });

  it('overlays a test-only rule the project enables on the test ruleset instead of running it twice', () => {
    const projectText = `<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>p</description>
  <rule ref="category/java/errorprone.xml"/>
  <rule ref="category/java/errorprone.xml/TestClassWithoutTestCases">
    <priority>2</priority>
    <properties><property name="testClassPattern" value="Spec.*"/></properties>
  </rule>
</ruleset>`;
    const { project, tests, replaced } = layer({ projectText });

    expect(replaced).toEqual([]);
    expect(project)
      .toBe(`${HEADER}<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>p</description>
</ruleset>
`);
    expect(tests)
      .toBe(`${HEADER}<ruleset name="nitpicker-test-rules" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>Nitpicker's test-only PMD rules, with the project's settings over them.</description>
  <rule ref="category/java/errorprone.xml/TestClassWithoutTestCases">
    <priority>2</priority>
    <properties>
      <property name="testClassPattern" value="Spec.*"/>
    </properties>
  </rule>
</ruleset>
`);
  });

  it('keeps the test ruleset as nitpicker has it when the project only enables the category', () => {
    const projectText = `<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>p</description>
  <rule ref="category/java/errorprone.xml"/>
</ruleset>`;
    const { project, tests } = layer({ projectText });

    expect(project)
      .toBe(`${HEADER}<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>p</description>
</ruleset>
`);
    expect(tests)
      .toBe(`${HEADER}<ruleset name="nitpicker-test-rules" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>Nitpicker's test-only PMD rules, with the project's settings over them.</description>
  <rule ref="category/java/errorprone.xml/TestClassWithoutTestCases">
    <properties>
      <property name="testClassPattern" value="Test.*"/>
    </properties>
  </rule>
</ruleset>
`);
  });

  it('does not enable a category rule nitpicker left out when the project excludes it too', () => {
    const projectText = `<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>p</description>
  <rule ref="category/java/errorprone.xml">
    <exclude name="TestClassWithoutTestCases"/>
    <exclude name="CloseResource"/>
  </rule>
</ruleset>`;

    expect(layer({ projectText }).project)
      .toBe(`${HEADER}<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>p</description>
</ruleset>
`);
  });

  it('keeps the values nitpicker sets when nitpicker is first and adds what the project sets', () => {
    const { nitpicker, project, replaced } = layer({ projectText: PROJECT, projectWins: false });

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
  <rule ref="category/java/errorprone.xml/AvoidLiteralsInIfCondition" message="Name this number.">
    <priority>2</priority>
    <properties>
      <property name="ignoreMagicNumbers" value="0,1"/>
      <property name="ignoreExpressions" value="true"/>
    </properties>
  </rule>
  <rule name="OwnRule" language="java" class="net.sourceforge.pmd.lang.rule.xpath.XPathRule" message="Own message.">
    <description>Own description.</description>
    <priority>1</priority>
    <properties>
      <property name="xpath">
        <value>//A[@B &lt; 1]</value>
      </property>
    </properties>
  </rule>
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

  it('keeps the measured helpers in the assertion rule the project names, unless it sets the list', () => {
    const named = (body) =>
      `<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>p</description>
  <rule ref="category/java/bestpractices.xml/UnitTestShouldIncludeAssert">${body}</rule>
</ruleset>`;
    const projectFile = (
      properties,
    ) => `${HEADER}<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>p</description>
  <rule ref="category/java/bestpractices.xml/UnitTestShouldIncludeAssert">
    <priority>1</priority>
    <properties>
      <property name="extraAssertMethodNames" value="${properties}"/>
    </properties>
  </rule>
</ruleset>
`;

    const kept = layer({
      projectText: named('<priority>1</priority>'),
      assertionHelpers: ['expectOk'],
    });
    const own = layer({
      projectText: named(
        '<properties><property name="extraAssertMethodNames" value="mine"/></properties><priority>1</priority>',
      ),
      assertionHelpers: ['expectOk'],
    });

    expect(kept.replaced).toEqual(['UnitTestShouldIncludeAssert']);
    expect(kept.project).toBe(projectFile('andExpect,verifyComplete,expectOk'));
    expect(own.project).toBe(projectFile('mine'));
    expect(kept.nitpicker)
      .toBe(`${HEADER}<ruleset name="nitpicker" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>Nitpicker's PMD rules, without the rules the project's ruleset sets itself.</description>
  <rule ref="/nitpicker/pmd-ruleset.xml">
    <exclude name="UnitTestShouldIncludeAssert"/>
  </rule>
</ruleset>
`);
  });
});
