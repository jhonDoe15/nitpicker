import { describe, expect, it } from 'vitest';
import { resolvedRulesets } from './pmd-catalog.mts';
import { onlyFiles, renderedRuleset } from './pmd-render.mts';
import { engineRule, portablePattern, ruleLevel, runsOnEngine } from './pmd-rule-parts.mts';

const XPATH = 'net.sourceforge.pmd.lang.rule.xpath.XPathRule';
const HEAD = '<ruleset name="demo" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">';

function query(name: string, xpath: string, extra = ''): string {
  return [
    `<rule name="${name}" language="java" class="${XPATH}" message="${name} found" ${extra}>`,
    '<priority>3</priority><properties>',
    `<property name="xpath"><value><![CDATA[${xpath}]]></value></property>`,
    '<property name="limit" type="Integer" value="3"/>',
    '</properties></rule>',
  ].join('');
}

const FILES: Readonly<Record<string, string>> = {
  'category/java/demo.xml': [
    HEAD,
    query('Shipped', '//A'),
    query('Old', '//B', 'deprecated="true"'),
    query('Ancient', '//C', 'maximumLanguageVersion="1.4"'),
    '<rule name="Coded" language="java" class="demo.CodedRule" message="coded"><priority>1</priority></rule>',
    '<rule name="Renamed" ref="Shipped" deprecated="true"/>',
    '</ruleset>',
  ].join(''),
  '/rules/own.xml': [
    HEAD,
    '<rule ref="category/java/demo.xml"><exclude name="Shipped"/></rule>',
    '<rule ref="category/java/demo.xml/Shipped" message="shipped, reworded">',
    '<priority>2</priority><properties><property name="limit" value="7"/></properties></rule>',
    query('Own', '//D'),
    '</ruleset>',
  ].join(''),
  '/rules/main.xml': [
    HEAD,
    String.raw`<exclude-pattern>\Q/project/src/test/\E.*</exclude-pattern>`,
    '<rule ref="/rules/own.xml"><exclude name="Own"/></rule>',
    '<rule ref="/rules/own.xml/Own"><properties><property name="limit"><value>9</value></property></properties></rule>',
    '</ruleset>',
  ].join(''),
  '/rules/renaming.xml': `${HEAD}<rule ref="/rules/own.xml/Own" name="Mine"/></ruleset>`,
};

function resolved(file: string): ReturnType<ReturnType<typeof resolvedRulesets>> {
  return resolvedRulesets((reference) => {
    const text = FILES[reference];
    if (text === undefined) {
      throw new Error(`no ${reference}`);
    }
    return text;
  })(file);
}

describe('resolvedRulesets', () => {
  it('follows whole-ruleset and single-rule references and leaves deprecated rules out', () => {
    const { rules } = resolved('/rules/own.xml');

    expect(rules.map(({ name, source }) => [name, source])).toEqual([
      ['Ancient', 'category/java/demo.xml'],
      ['Coded', 'category/java/demo.xml'],
      ['Shipped', 'category/java/demo.xml'],
      ['Own', '/rules/own.xml'],
    ]);
  });

  it('keeps every override on the way from the definition to the ruleset that runs', () => {
    const main = resolved('/rules/main.xml');
    const shipped = main.rules.find(({ name }) => name === 'Shipped');
    const own = main.rules.find(({ name }) => name === 'Own');

    expect(main.exclude).toEqual([String.raw`\Q/project/src/test/\E.*`]);
    expect(shipped?.overrides).toHaveLength(1);
    expect(own?.overrides).toHaveLength(1);
  });

  it('refuses a reference it cannot follow', () => {
    expect(() => resolved('/rules/renaming.xml')).toThrow('cannot follow');
    expect(() => resolved('/rules/missing.xml')).toThrow('no /rules/missing.xml');
  });
});

describe('engine rules', () => {
  const main = resolved('/rules/main.xml');
  const named = (wanted: string) => {
    const rule = main.rules.find(({ name }) => name === wanted);
    if (rule === undefined) {
      throw new Error(`no ${wanted}`);
    }
    return rule;
  };

  it('sends XPath rules of the current language level to the engine', () => {
    expect(main.rules.filter(runsOnEngine).map(({ name }) => name)).toEqual(['Shipped', 'Own']);
  });

  it('writes a rule with the outermost message, level and property values', () => {
    expect(engineRule(named('Shipped'), main)).toEqual({
      name: 'Shipped',
      xpath: '//A',
      message: 'shipped, reworded',
      suppress: '',
      properties: { limit: { type: 'Integer', value: '7' } },
      include: [],
      exclude: [String.raw`/project/src/test/.*`],
    });
    expect(engineRule(named('Own'), main).properties).toEqual({
      limit: { type: 'Integer', value: '9' },
    });
    expect(ruleLevel(named('Shipped'))).toBe('error');
    expect(ruleLevel(named('Own'))).toBe('warning');
    expect(ruleLevel(named('Coded'))).toBe('error');
  });

  it('turns a quoted section of a Java pattern into escaped text', () => {
    expect(portablePattern(String.raw`\Q/a.b/(c)\E.*`)).toBe(String.raw`/a\.b/\(c\).*`);
    expect(portablePattern('.*')).toBe('.*');
  });
});

describe('renderedRuleset', () => {
  it('refers to each rule where it is defined and repeats what the rulesets changed', () => {
    const main = resolved('/rules/main.xml');
    const text = renderedRuleset(
      main.name,
      main,
      main.rules.filter((rule) => !runsOnEngine(rule)),
    );

    expect(text).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ruleset name="demo" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">',
        '  <description>demo</description>',
        String.raw`  <exclude-pattern>\Q/project/src/test/\E.*</exclude-pattern>`,
        '  <rule ref="category/java/demo.xml/Ancient"/>',
        '  <rule ref="category/java/demo.xml/Coded"/>',
        '</ruleset>',
        '',
      ].join('\n'),
    );
  });

  it('repeats a message, a priority and properties a reference set', () => {
    const main = resolved('/rules/main.xml');
    const text = renderedRuleset(
      'again',
      onlyFiles(['/project/A.java']),
      main.rules.filter(runsOnEngine),
    );

    expect(text).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ruleset name="again" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">',
        '  <description>again</description>',
        '  <exclude-pattern>.*</exclude-pattern>',
        String.raw`  <include-pattern>\Q/project/A.java\E</include-pattern>`,
        '  <rule ref="category/java/demo.xml/Shipped" message="shipped, reworded">',
        '    <priority>2</priority>',
        '    <properties>',
        '      <property name="limit" value="7"/>',
        '    </properties>',
        '  </rule>',
        '  <rule ref="/rules/own.xml/Own">',
        '    <properties>',
        '      <property name="limit">',
        '        <value>9</value>',
        '      </property>',
        '    </properties>',
        '  </rule>',
        '</ruleset>',
        '',
      ].join('\n'),
    );
  });
});
