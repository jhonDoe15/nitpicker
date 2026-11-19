import { describe, expect, it } from 'vitest';
import { recipeProject } from '../../source/test-support/recipe-project.mts';
import { staticForwardingWrapperRecipe as recipe } from '../forwarder-recipes.mts';
import {
  FACADE_AFTER,
  FACADE_PATH,
  REPORT_AFTER,
  REPORT_PATH,
  RULE,
  projectOf,
} from './test-support/wrapper-sources.mts';

describe('staticForwardingWrapperRecipe', () => {
  it('is a review recipe for pmd/StaticForwardingWrapper in the Java preset', () => {
    expect([recipe.safety, recipe.scope, recipe.presets, recipe.rules]).toEqual([
      'review',
      'project',
      ['java'],
      [{ tool: 'pmd', rule: 'StaticForwardingWrapper' }],
    ]);
  });

  it('points the callers at the target and deletes the wrapper', () => {
    const { result, read } = recipeProject({ files: projectOf(), rule: RULE });

    expect(result.toolErrors).toEqual([]);
    expect(result.fixedFindings).toEqual([
      `${FACADE_PATH}:7 pmd/StaticForwardingWrapper (java-static-forwarding-wrapper)`,
    ]);
    expect(read(FACADE_PATH)).toBe(FACADE_AFTER);
    expect(read(REPORT_PATH)).toBe(REPORT_AFTER);
  });

  it('keeps an import that other code in the caller still needs', () => {
    const report = `package shop;

import shop.util.Strings;

class Report {
  String render(String text) {
    return Strings.trim(Facade.trim(text));
  }
}
`;
    const { read } = recipeProject({ files: projectOf({ [REPORT_PATH]: report }), rule: RULE });

    expect(read(REPORT_PATH)).toBe(report.replace('Facade.trim', 'Strings.trim'));
  });
});
