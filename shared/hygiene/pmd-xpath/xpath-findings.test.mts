import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mts';
import { trackedFiles } from '../tracked-files.mts';
import { pmdXPathMistakeFindings } from './xpath-findings.mts';

const { createGitRepository } = useGitFixtures();

function reported(xpaths: Record<string, string>, before = ''): string[] {
  const rules = Object.entries(xpaths)
    .map(
      ([name, xpath]) =>
        `  <rule name="${name}" language="java" class="net.sourceforge.pmd.lang.rule.xpath.XPathRule" message="m">\n    <properties><property name="xpath"><value><![CDATA[\n${xpath}\n]]></value></property></properties>\n  </rule>`,
    )
    .join('\n');
  const { root } = createGitRepository({
    'config/pmd/rules.xml': `<?xml version="1.0"?>\n<ruleset name="own">\n${before}${rules}\n</ruleset>\n`,
  });
  return pmdXPathMistakeFindings('repository-hygiene', {
    projectRoot: root,
    files: trackedFiles(root),
  }).map(({ identity }) => identity.split('|').at(-1) ?? '');
}

describe('pmd-xpath-rule-mistake', () => {
  it('reports a root scan inside a predicate', () => {
    expect(
      reported({
        AbsoluteInPredicate: "//MethodDeclaration[//MethodCall[@MethodName = 'close']]",
        AncestorScan: '//MethodCall[ancestor::CompilationUnit//ImportDeclaration]',
        InFunction: '//MethodCall[count(//Annotation) > 0]',
        KeywordThenPath: '//MethodCall[@Name = "a" and //Annotation]',
      }),
    ).toEqual(['AbsoluteInPredicate', 'AncestorScan', 'InFunction', 'KeywordThenPath']);
  });

  it('leaves relative paths, top-level scans and string contents alone', () => {
    expect(
      reported({
        Relative:
          '//MethodCall[.//Annotation][ancestor::MethodDeclaration//Block][../ArgumentList]',
        TopLevel: "let $x := //Field return //MethodCall[@Name = 'a//b']",
        Chained: '//A[B/C//D][E[1]//F][(G | H)//I]',
        Commented: '//A[(: //B :) C]',
        RootChildren: "//A[/CompilationUnit/ImportDeclaration[@ImportedName = 'x']]",
        AncestorChildren: '//A[ancestor::CompilationUnit/ImportDeclaration]',
      }),
    ).toEqual([]);
  });

  it('keeps rules after a self-closing rule reference', () => {
    expect(
      reported(
        { Scan: '//MethodDeclaration[//MethodCall]' },
        '  <rule ref="category/java/design.xml/GodClass"/>\n',
      ),
    ).toEqual(['Scan']);
  });

  it('treats a word after a dollar sign as a variable, not a keyword', () => {
    expect(
      reported({
        Variables: '//A[exists($eq/B)][empty($in/C)][not($not/D)][exists($eq//MethodCall[@X])]',
      }),
    ).toEqual([]);
  });

  it('reports single-item functions and eq over several parameters', () => {
    expect(
      reported({
        StringOfParameters:
          'let $p := string(FormalParameters/FormalParameter/VariableId/@Name) return //MethodDeclaration[$p = "a"]',
        LowerCase:
          '//MethodDeclaration[lower-case(FormalParameters/FormalParameter/VariableId/@Name) = "a"]',
        Compare: '//MethodCall[ArgumentList/StringLiteral/@Image eq "x"]',
        Starts: '//MethodDeclaration[starts-with(@Name, FormalParameters/FormalParameter/@Name)]',
      }),
    ).toEqual(['StringOfParameters', 'LowerCase', 'Compare', 'Starts']);
  });

  it('leaves guarded paths and node-valued steps alone', () => {
    expect(
      reported({
        First: '//M[string(FormalParameters/FormalParameter[1]/VariableId/@Name) = "a"]',
        Wrapped: '//M[string((FormalParameters/FormalParameter/VariableId/@Name)[1]) = "a"]',
        Exactly: '//M[string(exactly-one(FormalParameters/FormalParameter/@Name)) = "a"]',
        Counted:
          '//M[count(FormalParameters/FormalParameter) = 1][lower-case(FormalParameters/FormalParameter/VariableId/@Name) = "a"]',
        General: '//M[FormalParameters/FormalParameter/VariableId/@Name = "a"]',
        Single: '//M[lower-case(@Name) = "a"][starts-with(Block/@Image, "x")]',
        Counting: '//M[string(count(FormalParameters/FormalParameter)) = "1"]',
      }),
    ).toEqual([]);
  });
});
