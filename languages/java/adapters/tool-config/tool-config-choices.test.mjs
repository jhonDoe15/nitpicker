import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { toolConfigProperties } from './tool-config-choices.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-tools-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const RULESET = `<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>p</description>
  <rule ref="category/java/performance.xml/AvoidArrayLoops"/>
</ruleset>`;
const CHECKSTYLE = '<module name="Checker"/>';

describe('the Gradle properties of the project tool configs', () => {
  it("passes nothing by default, and the layered files of the head project's configs when opted in", () => {
    const head = projectWith({
      'config/pmd/ruleset.xml': RULESET,
      'config/checkstyle/checkstyle.xml': CHECKSTYLE,
    });
    const directory = path.join(head, 'layers');

    expect(toolConfigProperties('/base', { policyRoot: head }, directory)).toEqual([]);
    expect(
      toolConfigProperties(
        '/base',
        {
          policyRoot: head,
          toolPrecedence: { pmd: ['project', 'nitpicker'], checkstyle: ['project'] },
        },
        directory,
      ),
    ).toEqual([
      `-Pnitpicker.pmd.nitpickerRuleset=${path.join(directory, 'pmd-nitpicker.xml')}`,
      `-Pnitpicker.pmd.projectConfig=${path.join(directory, 'pmd-project.xml')}`,
      `-Pnitpicker.checkstyle.projectConfig=${path.join(head, 'config/checkstyle/checkstyle.xml')}`,
      `-Pnitpicker.node=${process.execPath}`,
    ]);
    expect(readFileSync(path.join(directory, 'pmd-project.xml'), 'utf8')).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">',
        '  <description>p</description>',
        '  <rule ref="category/java/performance.xml/AvoidArrayLoops"/>',
        '</ruleset>',
        '',
      ].join('\n'),
    );
  });

  it('layers the project over nitpicker for ["project"] too, and never drops nitpicker', () => {
    const head = projectWith({ 'config/pmd/ruleset.xml': RULESET });
    const directory = path.join(head, 'layers');

    const properties = toolConfigProperties(
      '/base',
      { policyRoot: head, toolPrecedence: { pmd: ['project'] } },
      directory,
    );

    expect(properties).toEqual([
      `-Pnitpicker.pmd.nitpickerRuleset=${path.join(directory, 'pmd-nitpicker.xml')}`,
      `-Pnitpicker.pmd.projectConfig=${path.join(directory, 'pmd-project.xml')}`,
    ]);
  });

  it("adds the project's measured assertion helpers to nitpicker's PMD ruleset without a project file", () => {
    const root = projectWith({});
    const directory = path.join(root, 'layers');

    const properties = toolConfigProperties(
      root,
      { conventions: { 'java.assertionHelpers': ['expectOk', 'mustBe'] } },
      directory,
    );

    expect(properties).toEqual([
      `-Pnitpicker.pmd.nitpickerRuleset=${path.join(directory, 'pmd-nitpicker.xml')}`,
    ]);
  });

  it('tells Gradle when nitpicker is first', () => {
    const head = projectWith({ 'config/checkstyle/checkstyle.xml': CHECKSTYLE });

    expect(
      toolConfigProperties(
        '/base',
        { policyRoot: head, toolPrecedence: { checkstyle: ['nitpicker', 'project'] } },
        path.join(head, 'layers'),
      ),
    ).toEqual([
      `-Pnitpicker.checkstyle.projectConfig=${path.join(head, 'config/checkstyle/checkstyle.xml')}`,
      `-Pnitpicker.node=${process.execPath}`,
      '-Pnitpicker.checkstyle.projectWins=false',
    ]);
  });

  it('fails with the missing file when the project layer is chosen without one', () => {
    expect(() =>
      toolConfigProperties(projectWith({}), { toolPrecedence: { pmd: ['project'] } }, '/unused'),
    ).toThrow(
      new Error('"tools.pmd.precedence" lists "project" but config/pmd/ruleset.xml is missing'),
    );
  });
});
