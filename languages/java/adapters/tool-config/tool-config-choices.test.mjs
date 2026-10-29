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
  <rule ref="category/java/codestyle.xml/UnnecessaryImport"/>
</ruleset>`;
const CHECKSTYLE =
  '<module name="Checker"><module name="LineLength"><property name="max" value="140"/></module></module>';
const NITPICKER_CHECKSTYLE =
  '<module name="Checker"><module name="LineLength"><property name="max" value="100"/></module></module>';
const MERGED = (max) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN" "https://checkstyle.org/dtds/configuration_1_3.dtd">
<module name="Checker">
  <module name="LineLength">
    <property name="max" value="${max}"/>
  </module>
</module>
`;

describe('the Gradle properties of the project tool configs', () => {
  it("passes nothing by default, and the layered files of the head project's configs when opted in", () => {
    const head = projectWith({
      'config/pmd/ruleset.xml': RULESET,
      'config/checkstyle/checkstyle.xml': CHECKSTYLE,
    });
    const directory = path.join(head, 'layers');
    const checkstyleBase = path.join(head, 'nitpicker-checkstyle.xml');
    writeFileSync(checkstyleBase, NITPICKER_CHECKSTYLE);

    expect(toolConfigProperties('/base', { policyRoot: head }, { directory })).toEqual([]);
    expect(
      toolConfigProperties(
        '/base',
        {
          policyRoot: head,
          toolPrecedence: { pmd: ['project', 'nitpicker'], checkstyle: ['project'] },
        },
        { directory, checkstyleBase },
      ),
    ).toEqual([
      `-Pnitpicker.pmd.nitpickerRuleset=${path.join(directory, 'pmd-nitpicker.xml')}`,
      `-Pnitpicker.pmd.projectConfig=${path.join(directory, 'pmd-project.xml')}`,
      `-Pnitpicker.pmd.testRules=${path.join(directory, 'pmd-test-rules.xml')}`,
      `-Pnitpicker.pmd.mainRules=${path.join(directory, 'pmd-main-rules.xml')}`,
      `-Pnitpicker.checkstyle.projectConfig=${path.join(head, 'config/checkstyle/checkstyle.xml')}`,
      `-Pnitpicker.checkstyle.mergedConfig=${path.join(directory, 'checkstyle-merged.xml')}`,
    ]);
    expect(readFileSync(path.join(directory, 'checkstyle-merged.xml'), 'utf8')).toBe(MERGED(140));
    expect(readFileSync(path.join(directory, 'pmd-project.xml'), 'utf8')).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">',
        '  <description>p</description>',
        '  <rule ref="category/java/codestyle.xml/UnnecessaryImport"/>',
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
      { directory },
    );

    expect(properties).toEqual([
      `-Pnitpicker.pmd.nitpickerRuleset=${path.join(directory, 'pmd-nitpicker.xml')}`,
      `-Pnitpicker.pmd.projectConfig=${path.join(directory, 'pmd-project.xml')}`,
      `-Pnitpicker.pmd.testRules=${path.join(directory, 'pmd-test-rules.xml')}`,
      `-Pnitpicker.pmd.mainRules=${path.join(directory, 'pmd-main-rules.xml')}`,
    ]);
  });

  it("adds the project's measured assertion helpers to nitpicker's PMD ruleset without a project file", () => {
    const root = projectWith({});
    const directory = path.join(root, 'layers');

    const properties = toolConfigProperties(
      root,
      { conventions: { 'java.assertionHelpers': ['expectOk', 'mustBe'] } },
      { directory },
    );

    expect(properties).toEqual([
      `-Pnitpicker.pmd.nitpickerRuleset=${path.join(directory, 'pmd-nitpicker.xml')}`,
    ]);
  });

  it('merges with nitpicker first when the policy lists nitpicker before the project', () => {
    const head = projectWith({
      'config/checkstyle/checkstyle.xml': CHECKSTYLE,
      'nitpicker-checkstyle.xml': NITPICKER_CHECKSTYLE,
    });
    const directory = path.join(head, 'layers');

    expect(
      toolConfigProperties(
        '/base',
        { policyRoot: head, toolPrecedence: { checkstyle: ['nitpicker', 'project'] } },
        { directory, checkstyleBase: path.join(head, 'nitpicker-checkstyle.xml') },
      ),
    ).toEqual([
      `-Pnitpicker.checkstyle.projectConfig=${path.join(head, 'config/checkstyle/checkstyle.xml')}`,
      `-Pnitpicker.checkstyle.mergedConfig=${path.join(directory, 'checkstyle-merged.xml')}`,
    ]);
    expect(readFileSync(path.join(directory, 'checkstyle-merged.xml'), 'utf8')).toBe(MERGED(100));
  });

  it("hands Gradle the SpotBugs settings layered from the head build's declarations", () => {
    const head = projectWith({
      'build.gradle':
        "spotbugs {\n  reportLevel = 'low'\n  excludeFilter = file('exclude.xml')\n}\n",
      'exclude.xml': '<FindBugsFilter/>',
    });
    const directory = path.join(head, 'layers');
    const settings = path.join(directory, 'spotbugs-settings.json');

    expect(
      toolConfigProperties(
        '/base',
        { policyRoot: head, toolPrecedence: { spotbugs: ['project'] } },
        { directory },
      ),
    ).toEqual([`-Pnitpicker.spotbugs.settings=${settings}`]);
    expect(JSON.parse(readFileSync(settings, 'utf8'))).toEqual([
      '-effort:default',
      '-low',
      '-exclude',
      path.join(head, 'exclude.xml'),
    ]);
  });

  it('fails with the missing file when the project layer is chosen without one', () => {
    expect(() =>
      toolConfigProperties(
        projectWith({}),
        { toolPrecedence: { pmd: ['project'] } },
        {
          directory: '/unused',
        },
      ),
    ).toThrow(
      new Error('"tools.pmd.precedence" lists "project" but config/pmd/ruleset.xml is missing'),
    );
  });
});
