const SENTENCE_BREAK = /(?<=\.)\s+(?=[A-Z])/u;

function sentencesOf(step) {
  return step.split(SENTENCE_BREAK);
}

function withoutRepeats(steps) {
  const seen = new Set();
  return steps
    .map((step) =>
      sentencesOf(step)
        .filter((sentence) => {
          const fresh = !seen.has(sentence);
          seen.add(sentence);
          return fresh;
        })
        .join(' '),
    )
    .filter((step) => step !== '');
}

export function stepsOf(...items) {
  const steps = withoutRepeats(
    items.flat().filter((item) => typeof item === 'string' && item !== ''),
  );
  return steps.filter(
    (step, index) =>
      !steps.some(
        (other, at) => at !== index && other.length > step.length && other.includes(step),
      ),
  );
}

export function lineRanges(blocks) {
  return blocks
    .map(({ startLine, endLine }) => `${String(startLine)}-${String(endLine)}`)
    .join(', ');
}

export function readStep(place, measure) {
  return measure === '' ? `Read ${place}.` : `Read ${place}: ${measure}.`;
}

export function amount(value, unit, limit) {
  if (value === undefined) {
    return '';
  }
  return limit === undefined
    ? `${String(value)} ${unit}`
    : `${String(value)} ${unit}, limit ${String(limit)}`;
}
