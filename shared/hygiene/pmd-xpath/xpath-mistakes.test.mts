import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mts';
import { trackedFiles } from '../tracked-files.mts';
import { predicateScans, severalNodeUses } from './xpath-mistakes.mts';
import { projectXPathRules } from './xpath-source.mts';

const { createGitRepository } = useGitFixtures();
const ASTRAL = '\u{1F600}';

describe('predicateScans', () => {
  it('reads paths that end after characters outside the basic plane', () => {
    expect(predicateScans(`//A[@n = '${ASTRAL}']/`)).toEqual([]);
    expect(
      predicateScans(`//A[@n = '${ASTRAL.repeat(30)}' or ancestor::CompilationUnit//B]`),
    ).toEqual([]);
  });
});

describe('severalNodeUses', () => {
  it('leaves an unclosed function call and comparisons without a path operand alone', () => {
    expect(severalNodeUses('//M[string(FormalParameters/FormalParameter')).toEqual([]);
    expect(severalNodeUses(' eq FormalParameters/FormalParameter')).toEqual([
      'FormalParameters/FormalParameter',
    ]);
    expect(severalNodeUses('//M[FormalParameters/FormalParameter eq (Block/A)]')).toEqual([
      'FormalParameters/FormalParameter',
    ]);
  });
});

describe('projectXPathRules', () => {
  it('decodes escaped XPath text and skips rules without a name or an XPath', () => {
    const { root } = createGitRepository({
      'config/pmd/rules.xml':
        '<?xml version="1.0"?>\n<ruleset name="own">\n' +
        '<rule name="Escaped"><properties><property name="xpath">' +
        '<value>//A[@n &lt; 2 and @s = &quot;a&amp;b&quot;]</value></property></properties></rule>\n' +
        '<rule name="NoXPath"><properties><property name="minimum"><value>1</value></property>' +
        '</properties></rule>\n' +
        '<rule class="Unnamed"><properties><property name="xpath"><value>//B</value></property>' +
        '</properties></rule>\n' +
        '</ruleset>\n',
    });

    expect(projectXPathRules(root, trackedFiles(root))).toEqual([
      { file: 'config/pmd/rules.xml', rule: 'Escaped', xpath: "//A[@n < 2 and @s = '']" },
    ]);
  });
});
