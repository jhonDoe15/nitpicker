import { answerAhead, isNoting, noteQuestions } from '../decide-sync.mjs';
import { decideAll } from './decide-pool.mjs';

function answeredAhead(questions, workers) {
  const results = decideAll(
    questions.map(([, request]) => request),
    { workers },
  );
  return questions
    .map(([id], index) => [id, results[index]])
    .filter(([, result]) => result !== undefined);
}

/**
 * `run()`, with the solver questions it asks answered ahead on up to `decisionWorkers` solver
 * threads: a dry run notes the questions not answered yet, the threads answer them together, then
 * the real run takes those answers and asks the rest itself. The answers, and so the result, are
 * those of a plain `run()`.
 */
export function decidedAhead(run, { decisionWorkers = 1 } = {}) {
  if (decisionWorkers < 2 || isNoting()) {
    return run();
  }
  try {
    const questions = noteQuestions(run);
    if (questions.length > 0) {
      answerAhead(answeredAhead(questions, decisionWorkers));
    }
    return run();
  } finally {
    answerAhead(undefined);
  }
}
