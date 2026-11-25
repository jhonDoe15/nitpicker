import { answerAhead, forgetAnswersAhead, isNoting, noteQuestions } from '../decide-sync.mts';
import { decideAll } from './decide-pool.mts';
import type { DecisionQuestion } from '../../typed/solver-types.mts';

function answeredAhead(
  questions: readonly [string, DecisionQuestion][],
  workers: number,
): [string, unknown][] {
  const results = decideAll(
    questions.map(([, request]) => request),
    { workers },
  );
  return questions
    .map(([id], index): [string, unknown] => [id, results[index]])
    .filter(([, result]) => result !== undefined);
}

export function decidedAhead<Result>(
  run: () => Result,
  { decisionWorkers = 1 }: { readonly decisionWorkers?: number } = {},
): Result {
  if (decisionWorkers < 2 || isNoting()) {
    return run();
  }
  try {
    const questions = noteQuestions(run, { keepSettled: true });
    if (questions.length > 0) {
      answerAhead(answeredAhead(questions, decisionWorkers));
    }
    return run();
  } finally {
    forgetAnswersAhead();
  }
}
