import { describe, expect, it } from 'vitest';
import { runnerVocabulary } from '../../test-runner/vocabulary/runner-vocabulary.mjs';
import { testingLibraryHintsFor } from './react-rules.mjs';

describe('the Testing Library hints', () => {
  it.each([
    ['jest', '`toHaveFocus()`', '`expect(screen.getByRole(...)).toBeVisible()`'],
    [
      'node',
      '`assert.equal(document.activeElement, element)`',
      '`assert.ok(screen.getByRole(...))`',
    ],
    [
      'mocha',
      '`assert.equal(document.activeElement, element)`, or `expect(element).to.have.focus` with chai-dom',
      '`assert.ok(screen.getByRole(...))`, or `expect(screen.getByRole(...)).to.be.visible` with chai-dom',
    ],
  ])('names the focus and visibility assertions a %s project has', (runner, focus, visible) => {
    const hints = testingLibraryHintsFor(runnerVocabulary(runner));

    expect([hints['no-node-access'], hints['no-debugging-utils']]).toEqual([
      ` Use \`screen.getByRole(...)\` or \`within(...)\`, and ${focus} for focus.`,
      `. Remove the debug output and assert what you were looking for: ${visible}.`,
    ]);
  });
});
