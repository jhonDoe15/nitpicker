import { describe, expect, it } from 'vitest';
import { childrenNamed, parseXml } from '../../../../shared/ingest/common.mjs';
import { withGuardChecks } from './checkstyle-config.mjs';

function leaf(name) {
  return { name, modules: [] };
}

function moduleTree(element) {
  return { name: element.attrs.name, modules: childrenNamed(element, 'module').map(moduleTree) };
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
