import { describe, expect, it } from 'vitest';
import { childrenNamed, parseXml, type XmlElement } from '../../../../shared/values/xml.mts';
import {
  reportingCheckstyleConfig,
  withGuardChecks,
  withoutSuppressedChecks,
} from './checkstyle-config.mts';

type ModuleTree = { name: string | undefined; modules: ModuleTree[] };

function leaf(name: string): ModuleTree {
  return { name, modules: [] };
}

function moduleTree(element: XmlElement): ModuleTree {
  return {
    name: element.attrs['name'],
    modules: childrenNamed(element, 'module').map(moduleTree),
  };
}

describe('withGuardChecks', () => {
  const config =
    '<module name="Checker"><module name="TreeWalker"><module name="A"/></module></module>';

  it('adds the modules of the guard rule files at the start of the TreeWalker', () => {
    const merged = withGuardChecks(config, ['checkstyle-all.xml', 'checkstyle-main.xml']);

    expect(moduleTree(parseXml(merged))).toEqual({
      name: 'Checker',
      modules: [
        {
          name: 'TreeWalker',
          modules: [
            leaf('ConstantName'),
            leaf('SuppressionXpathSingleFilter'),
            leaf('MagicNumber'),
            leaf('VisibilityModifier'),
            leaf('SuppressionXpathSingleFilter'),
            leaf('SuppressionXpathSingleFilter'),
            leaf('A'),
          ],
        },
      ],
    });
  });

  it('adds only the modules of the files it is given', () => {
    const merged = withGuardChecks(config, ['checkstyle-all.xml']);

    expect(moduleTree(parseXml(merged))).toEqual({
      name: 'Checker',
      modules: [
        {
          name: 'TreeWalker',
          modules: [leaf('ConstantName'), leaf('SuppressionXpathSingleFilter'), leaf('A')],
        },
      ],
    });
  });

  it('fails when the bundled checks have no TreeWalker', () => {
    expect(() => withGuardChecks('<module name="Checker"/>', ['checkstyle-all.xml'])).toThrow(
      new Error('nitpicker could not find TreeWalker in google_checks.xml'),
    );
  });
});

describe('withoutSuppressedChecks', () => {
  const suppressions = [
    '<suppressions>',
    '<suppress checks="Indentation|LineLength" files="."/>',
    '<suppress id="LeftCurlyNl" files="."/>',
    '<!-- <suppress checks="NeedBraces" files="."/> -->',
    '<suppress checks="MagicNumber" files="Generated"/>',
    '</suppressions>',
  ].join('\n');
  const config = [
    '<module name="Checker">',
    '<module name="SuppressionFilter"><property name="file" value="x"/></module>',
    '<module name="LineLength"><property name="max" value="100"/></module>',
    '<module name="TreeWalker">',
    '<module name="SuppressionXpathSingleFilter"><property name="checks" value="Indentation"/></module>',
    '<module name="Indentation"/>',
    '<module name="CommentsIndentation"/>',
    '<module name="com.example.IndentationCheck"/>',
    '<module name="LeftCurly"><property name="id" value="LeftCurlyEol"/></module>',
    '<module name="LeftCurly"><property name="id" value="LeftCurlyNl"/></module>',
    '<module name="MagicNumber"/>',
    '<module name="NeedBraces"/>',
    '<module name="JavadocTagContinuationIndentation"/>',
    '</module>',
    '</module>',
  ].join('');

  it('drops the checks whose findings the suppressions discard for every file', () => {
    expect(moduleTree(parseXml(withoutSuppressedChecks(config, suppressions)))).toEqual({
      name: 'Checker',
      modules: [
        leaf('SuppressionFilter'),
        {
          name: 'TreeWalker',
          modules: [
            leaf('SuppressionXpathSingleFilter'),
            leaf('LeftCurly'),
            leaf('LeftCurly'),
            leaf('MagicNumber'),
            leaf('NeedBraces'),
          ],
        },
      ],
    });
  });

  it('keeps a check that is suppressed by id, so a layered project module still finds both', () => {
    const kept = withoutSuppressedChecks(config, suppressions);

    expect([kept.includes('value="LeftCurlyEol"'), kept.includes('value="LeftCurlyNl"')]).toEqual([
      true,
      true,
    ]);
  });

  it('keeps every check when no suppression covers all files', () => {
    expect(withoutSuppressedChecks(config, '<suppressions></suppressions>')).toBe(config);
  });
});

describe('reportingCheckstyleConfig', () => {
  const config =
    '<module name="Checker"><module name="TreeWalker"><module name="Indentation"/>' +
    '<module name="OperatorWrap"/><module name="NeedBraces"/></module></module>';

  it('leaves the layout checks to the formatter of a formatted project', () => {
    expect(moduleTree(parseXml(reportingCheckstyleConfig(config, false)))).toEqual({
      name: 'Checker',
      modules: [{ name: 'TreeWalker', modules: [leaf('NeedBraces')] }],
    });
  });

  it('keeps the indentation check for a project without a formatter', () => {
    expect(moduleTree(parseXml(reportingCheckstyleConfig(config, true)))).toEqual({
      name: 'Checker',
      modules: [{ name: 'TreeWalker', modules: [leaf('Indentation'), leaf('NeedBraces')] }],
    });
  });
});
