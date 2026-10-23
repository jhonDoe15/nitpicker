import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAIN_RULESET, NITPICKER_RULESET, TEST_RULESET } from './layer-files.mjs';
import { layerPmdRulesets } from './pmd-layers.mjs';

const project = (
  rules,
) => `<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>p</description>
${rules.join('\n')}
</ruleset>`;

const layer = (rules) =>
  layerPmdRulesets({
    nitpickerPath: NITPICKER_RULESET,
    nitpickerText: readFileSync(NITPICKER_RULESET, 'utf8'),
    testText: readFileSync(TEST_RULESET, 'utf8'),
    mainPath: MAIN_RULESET,
    mainText: readFileSync(MAIN_RULESET, 'utf8'),
    projectText: project(rules),
  });

const references = (text) => [...text.matchAll(/<rule ref="([^"]+)"/gu)].map(([, ref]) => ref);
const excludes = (text) => [...text.matchAll(/<exclude name="([^"]+)"/gu)].map(([, name]) => name);

describe("the shipped PMD ruleset under a project's ruleset", () => {
  it('re-enables exactly the rules nitpicker leaves out when the project names their categories', () => {
    const layers = layer([
      '  <rule ref="category/java/performance.xml"/>',
      '  <rule ref="category/java/multithreading.xml"/>',
      '  <rule ref="category/java/security.xml"/>',
    ]);

    expect(references(layers.project)).toEqual([
      'category/java/performance.xml/AvoidInstantiatingObjectsInLoops',
      'category/java/performance.xml/TooFewBranchesForSwitch',
      'category/java/performance.xml/InsufficientStringBufferDeclaration',
      'category/java/multithreading.xml/AvoidUsingVolatile',
      'category/java/multithreading.xml/DoNotUseThreads',
      'category/java/multithreading.xml/UseConcurrentHashMap',
    ]);
    expect(layers.replaced).toEqual([]);
    expect(references(layers.main)).toEqual([MAIN_RULESET]);
    expect(excludes(layers.main)).toEqual([]);
  });

  it("runs a rule the project sets once, with the project's priority", () => {
    const layers = layer([
      '  <rule ref="category/java/multithreading.xml"/>',
      '  <rule ref="category/java/multithreading.xml/AvoidSynchronizedStatement">',
      '    <priority>1</priority>',
      '  </rule>',
    ]);
    const projectRules = references(layers.project);

    expect(layers.replaced).toEqual(['AvoidSynchronizedStatement']);
    expect(excludes(layers.nitpicker)).toEqual(['AvoidSynchronizedStatement']);
    expect(projectRules.filter((ref) => ref.endsWith('/AvoidSynchronizedStatement'))).toHaveLength(
      1,
    );
    expect(layers.project).toContain(
      [
        '  <rule ref="category/java/multithreading.xml/AvoidSynchronizedStatement">',
        '    <priority>1</priority>',
        '  </rule>',
      ].join('\n'),
    );
  });

  it("keeps nitpicker's suppression on a tuned rule the project sets", () => {
    const layers = layer([
      '  <rule ref="category/java/multithreading.xml/DontCallThreadRun">',
      '    <priority>2</priority>',
      '  </rule>',
    ]);

    expect(layers.replaced).toEqual(['DontCallThreadRun']);
    expect(layers.project).toContain('<priority>2</priority>');
    expect(layers.project).toContain('name="violationSuppressXPath"');
  });

  it('keeps a security rule the project sets on main sources only', () => {
    const layers = layer([
      '  <rule ref="category/java/security.xml"/>',
      '  <rule ref="category/java/security.xml/HardCodedCryptoKey">',
      '    <priority>1</priority>',
      '  </rule>',
    ]);

    expect(references(layers.project)).toEqual([]);
    expect(layers.replaced).toEqual([]);
    expect(layers.main).toContain(
      [
        `  <rule ref="${MAIN_RULESET}">`,
        '    <exclude name="HardCodedCryptoKey"/>',
        '  </rule>',
        '  <rule ref="category/java/security.xml/HardCodedCryptoKey">',
        '    <priority>1</priority>',
        '  </rule>',
      ].join('\n'),
    );
  });
});
