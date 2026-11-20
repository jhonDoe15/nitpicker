import { type TSESLint } from '@typescript-eslint/utils';
import {
  answerOf,
  catchAround,
  isErrorBody,
  leavesStatus,
  statusSetAround,
  type Answer,
} from './error-answers.mts';

function defaultsToSuccess(answer: Answer, around: () => boolean): boolean {
  if (answer.kind === 'static') {
    return leavesStatus(answer.settings);
  }
  return answer.settings === undefined && !around();
}

export const rule: TSESLint.RuleModule<'successStatus'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report a catch block of a request handler that answers with an error body and no status, which is sent as 200 OK',
    },
    schema: [],
    messages: {
      successStatus:
        'This `catch` answers with an error body but gives no status, so the response is `200 OK`: the caller sees `response.ok`, a scheduler records the run as succeeded and nothing retries. Give the failure its status (`{ status: 500 }`, `res.status(500).json(...)`). When 200 is meant, for example so that a webhook sender stops retrying, write the status out (`{ status: 200 }`). An exception fits only when every caller reads the body and never the status.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const answer = answerOf(context.sourceCode, node);
        if (answer === undefined || !isErrorBody(answer.body)) {
          return;
        }
        const clause = catchAround(node);
        if (clause !== undefined && defaultsToSuccess(answer, () => statusSetAround(clause))) {
          context.report({ node, messageId: 'successStatus' });
        }
      },
    };
  },
};
