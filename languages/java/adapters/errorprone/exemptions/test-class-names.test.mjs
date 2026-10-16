import { describe, expect, it } from 'vitest';
import { isIntegrationTestName } from './test-class-names.mjs';

const suggesting = (name) => ({
  message:
    '[IdentifierName] Classes should be named in UpperCamelCase, with acronyms treated as words ' +
    `(https://google.github.io/styleguide/javaguide.html#s5.3-camel-case); did you mean '${name}'?\n` +
    '    (see https://google.github.io/styleguide/javaguide.html#s5.2-specific-identifier-names)',
});

describe('isIntegrationTestName', () => {
  it("spares the integration-test class names Maven's Failsafe plugin runs, and nothing else", () => {
    expect(
      ['AdderIt', 'ItAdder', 'AdderItCase', 'Audit', 'HttpClient', 'Items', 'MyItService'].map(
        (name) => isIntegrationTestName(suggesting(name)),
      ),
    ).toStrictEqual([true, true, true, false, false, false, false]);
    expect(
      isIntegrationTestName({
        message:
          '[IdentifierName] Methods and non-static variables should be named in lowerCamelCase, ' +
          "but AdderIT is not; did you mean 'adderIt'?",
      }),
    ).toBe(false);
  });
});
