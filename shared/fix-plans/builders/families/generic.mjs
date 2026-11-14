import { importEdge } from '../../plan-parts/edge.mjs';
import { allowedFormOf, describe, targetOf, without } from '../../plan-parts/finding.mjs';
import { sourceLine } from '../../plan-parts/source.mjs';
import { stepsOf } from '../../plan-parts/steps.mjs';

const KIND_STEPS = {
  'follow-allowed-form': [],
  'invert-dependency': [
    'Depend on an abstraction (an interface or a port) that the inner code owns, and pass the implementation in from the outside.',
  ],
  'move-module': ['Move it to where the rule allows it, and update its imports and its users.'],
  'parse-at-boundary': [
    'Parse the data once at the boundary into a typed value, and pass that value on instead of the raw one.',
  ],
  'strengthen-assertion': [
    'Assert the exact expected value, so that the test fails when the code is wrong.',
  ],
  'exercise-production-code': ['Call the production code from the test and assert its result.'],
  'remove-duplicate': ['Keep one copy, name it, and use it from every place.'],
  'reduce-complexity': ['Keep the behavior: run the tests that cover it after each change.'],
};

const EXCEPTION_SENTENCE = /\s*If (?:this|the repetition) is intended.*$/su;

function problemOf(message) {
  return message.replace(EXCEPTION_SENTENCE, '');
}

export function followRule(kind) {
  return (finding, env) => {
    const target = targetOf(finding, undefined);
    const edge = importEdge(finding, env);
    return {
      kind,
      target,
      context: without({ edge, source: edge === undefined ? sourceLine(finding, env) : undefined }),
      steps: stepsOf(
        `Read ${describe(target)}.`,
        allowedFormOf(finding, problemOf(finding.message)),
        KIND_STEPS[kind],
      ),
    };
  };
}
