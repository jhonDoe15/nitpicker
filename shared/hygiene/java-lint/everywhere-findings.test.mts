import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mts';
import type { FileMap } from '../../../core/diff/git/test-support/fixture-files.mts';
import { trackedFiles } from '../tracked-files.mts';
import { lintSuppressedEverywhereFindings } from './everywhere-findings.mts';

const { createGitRepository } = useGitFixtures();

function reported(files: FileMap, untracked: readonly string[] = []): string[] {
  const { root } = createGitRepository(files);
  return lintSuppressedEverywhereFindings('repository-hygiene', {
    projectRoot: root,
    files: [...trackedFiles(root), ...untracked],
  }).map(({ path, identity }) => `${path} ${identity.split('|').at(-1) ?? ''}`);
}

const config = (modules: string[], filter = 'checkstyle-suppressions.xml'): string =>
  `<?xml version="1.0"?>\n<module name="Checker">\n  <module name="SuppressionFilter">\n    <property name="file" value="\${config_loc}/${filter}"/>\n  </module>\n  <module name="TreeWalker">\n${modules.map((name) => `    <module name="${name}"/>`).join('\n')}\n  </module>\n</module>\n`;
const suppressions = (...entries: string[]): string =>
  `<?xml version="1.0"?>\n<suppressions>\n${entries.map((entry) => `  ${entry}`).join('\n')}\n</suppressions>\n`;
const PATH = 'config/checkstyle/checkstyle.xml';
const LIST = 'config/checkstyle/checkstyle-suppressions.xml';

describe('lint-check-suppressed-everywhere for Checkstyle', () => {
  it('reports enabled modules that an all-files suppression discards', () => {
    expect(
      reported({
        [PATH]: config(['Indentation', 'LineLength', 'EmptyBlock']),
        [LIST]: suppressions('<suppress checks="Indentation|LineLength|Missing" files="."/>'),
      }),
    ).toEqual([`${LIST} Indentation,LineLength`]);
    expect(
      reported({
        [PATH]: config(['OperatorWrap']),
        [LIST]: suppressions('<suppress checks="OperatorWrap" files=".*"/>'),
      }),
    ).toHaveLength(1);
  });

  it('pairs each suppressions file with the configurations that reference it', () => {
    expect(
      reported({
        [PATH]: config(['Indentation']),
        'config/checkstyle/checkstyle-legacy.xml': config(
          ['LineLength'],
          'legacy-suppressions.xml',
        ),
        'config/checkstyle/legacy-suppressions.xml': suppressions(
          '<suppress checks="Indentation" files="."/>',
        ),
      }),
    ).toEqual([]);
    expect(
      reported({
        [PATH]: config(['Indentation']),
        'config/checkstyle/checkstyle-legacy.xml': config(
          ['Indentation'],
          'legacy-suppressions.xml',
        ),
        'config/checkstyle/legacy-suppressions.xml': suppressions(
          '<suppress checks="Indentation" files="."/>',
        ),
      }),
    ).toEqual(['config/checkstyle/legacy-suppressions.xml Indentation']);
  });

  it('leaves xpath suppressions alone', () => {
    expect(
      reported({
        [PATH]: config(['Indentation']),
        [LIST]: suppressions(
          '<suppress-xpath checks="Indentation" files="." query="//METHOD_DEF"/>',
        ),
      }),
    ).toEqual([]);
    expect(
      reported({
        [PATH]: config(['Indentation']),
        [LIST]: suppressions('<suppress checks="Indentation" files="." query="//METHOD_DEF"/>'),
      }),
    ).toEqual([]);
  });

  it('leaves suppressions that are partial, disabled or not in the configuration alone', () => {
    expect(
      reported({
        [PATH]: config(['Indentation', 'EmptyBlock']),
        [LIST]: suppressions(
          '<suppress checks="Indentation" files="src/generated/.*"/>',
          '<suppress checks="EmptyBlock" files="." lines="1-20"/>',
          '<suppress checks="LineLength" files="."/>',
          '<!-- <suppress checks="Indentation" files="."/> -->',
        ),
      }),
    ).toEqual([]);
    expect(
      reported({
        [PATH]: config(['Indentation']),
        'other/suppressions.xml': suppressions('<suppress checks="Indentation" files="."/>'),
      }),
    ).toEqual([]);
  });
});

describe('lint-check-suppressed-everywhere for Checkstyle module settings', () => {
  const checker = (body: string): string =>
    `<?xml version="1.0"?>\n<module name="Checker">\n${body}\n</module>\n`;
  const filter =
    '<module name="SuppressionFilter">\n<property name="file" value="s.xml"/>\n</module>';

  it('matches suppressions by module id and skips modules set to ignore', () => {
    expect(
      reported({
        [PATH]: checker(
          `${filter}\n<module name="com.puppycrawl.tools.checkstyle.checks.sizes.LineLengthCheck">` +
            '<property name="id" value="long"/><property name="id" value="second"/></module>\n' +
            '<module name="Indentation"><property name="severity" value="ignore"/></module>',
        ),
        'config/s.xml': suppressions(
          '<suppress id="long" files=".*"/>',
          '<suppress checks="Indentation" files="."/>',
          '<suppress checks="LineLength"/>',
        ),
      }),
    ).toEqual(['config/s.xml long']);
  });

  it('reads single-filter suppressions and filters without a file', () => {
    expect(
      reported({
        [PATH]: checker(
          '<module name="SuppressionFilter"><property name="optional" value="true"/></module>\n' +
            '<module name="SuppressionSingleFilter">\n<property name="checks" value="EmptyBlock"/>' +
            '\n<property name="optional"/>\n<property name="files" value="."/>' +
            '\n<property name="files" value="src/.*"/>\n</module>\n<module name="EmptyBlock"/>',
        ),
      }),
    ).toEqual([`${PATH} EmptyBlock`]);
  });

  it('reads a module left open at the end of a broken configuration', () => {
    expect(
      reported(
        {
          [PATH]: checker(`${filter}\n<module name="LineLength">`).replace(/<\/module>\n$/u, ''),
          'config/s.xml': suppressions('<suppress checks="LineLength" files="."/>'),
        },
        ['config/missing.xml'],
      ),
    ).toEqual(['config/s.xml LineLength']);
  });
});

describe('lint-check-suppressed-everywhere for PMD', () => {
  const rule = (name: string, extra = ''): string =>
    `<rule ref="category/java/${name}.xml/X">${extra}</rule>`;
  const ruleset = (body: string): string =>
    `<?xml version="1.0"?>\n<ruleset name="x" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">\n${body}\n</ruleset>\n`;

  it('reports a ruleset that excludes every file and a rule that suppresses every violation', () => {
    expect(
      reported({
        'pmd/all.xml': ruleset(
          `<exclude-pattern>.*</exclude-pattern>\n<rule ref="category/java/codestyle.xml/UnnecessaryImport"/>`,
        ),
        'pmd/regex.xml': ruleset(
          `<rule ref="category/java/design.xml/GodClass"><properties><property name="violationSuppressRegex" value=".*"/></properties></rule>`,
        ),
      }),
    ).toEqual(['pmd/all.xml UnnecessaryImport', 'pmd/regex.xml GodClass']);
  });

  it('leaves partial exclusions and ordinary rulesets alone', () => {
    expect(
      reported({
        'pmd/part.xml': ruleset(
          `<exclude-pattern>.*/generated/.*</exclude-pattern>\n${rule('design')}`,
        ),
        'pmd/plain.xml': ruleset(rule('design')),
      }),
    ).toEqual([]);
  });

  it('names rules by their own name and skips rules with no name', () => {
    expect(
      reported({
        'pmd/own.xml': ruleset(
          '<rule name="NoFoo" class="net.sourceforge.pmd.lang.rule.xpath.XPathRule">' +
            '<exclude-pattern>.*</exclude-pattern></rule>\n' +
            '<rule class="Unnamed"><exclude-pattern>.*</exclude-pattern></rule>',
        ),
      }),
    ).toEqual(['pmd/own.xml NoFoo']);
  });
});
