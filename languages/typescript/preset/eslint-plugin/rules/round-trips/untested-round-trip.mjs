import {
  isTestedPair,
  memberCall,
  roundTripMessage,
  shownMember,
} from '../../../../../../shared/rules/round-trips/round-trips.mjs';
import { exportedPairs } from './exported-pairs.mjs';
import { testedNames } from './tested-names.mjs';

function example({ owner, inner, outer }) {
  return `expect(${memberCall(owner, outer, memberCall(owner, inner, 'value'))}).toEqual(value)`;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a test that runs each exported inverse pair on its own output' },
    schema: [],
    messages: { untested: '{{ message }}' },
  },
  create(context) {
    return {
      Program(program) {
        const pairs = exportedPairs(program);
        if (pairs.length === 0) {
          return;
        }
        const tests = testedNames(context.cwd);
        for (const pair of pairs.filter((found) => !isTestedPair(tests, found))) {
          const message = roundTripMessage({
            first: shownMember(pair.owner, pair.earlier),
            second: shownMember(pair.owner, pair.later),
            example: example(pair),
          });
          context.report({ node: pair.later.node, messageId: 'untested', data: { message } });
        }
      },
    };
  },
};
