import type { TSESLint } from '@typescript-eslint/utils';
import {
  memberCall as untypedMemberCall,
  roundTripMessage as untypedRoundTripMessage,
  shownMember as untypedShownMember,
} from '../../../../../../shared/rules/round-trips/round-trips.mjs';
import { exportedPairs, type Member, type OwnedPair } from './exported-pairs.mts';
import { untestedPairs } from './tested-names.mts';

const memberCall: (owner: string | undefined, member: Member, argument: string) => string =
  untypedMemberCall;
const roundTripMessage: (parts: {
  readonly first: string;
  readonly second: string;
  readonly example: string;
}) => string = untypedRoundTripMessage;
const shownMember: (owner: string | undefined, member: Member) => string = untypedShownMember;

function example({ owner, inner, outer }: OwnedPair): string {
  return `expect(${memberCall(owner, outer, memberCall(owner, inner, 'value'))}).toEqual(value)`;
}

export const rule: TSESLint.RuleModule<'untested', readonly []> = {
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
        for (const pair of untestedPairs(context.cwd, pairs)) {
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
