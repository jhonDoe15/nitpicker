const TOOL_NOISE = [
  /Picked up (?:JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|JDK_JAVA_OPTIONS):/u,
  /PIT >> INFO\b/u,
  /^\[ant:checkstyle\] /u,
];
const GRADLE_HINT = /^\* Try:$|^> (?:Run with|Get more help)/u;
const FAILURE_START = /^(?:FAILURE: |\* What went wrong:)/u;
const CAUSE = /^\s*Caused by:/u;
const MAX_CAUSE_LENGTH = 300;
const SEPARATOR = '\n...\n';

export function withoutToolNoise(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !TOOL_NOISE.some((noise) => noise.test(line)))
    .join('\n')
    .trim();
}

function failureBlock(lines, limit) {
  const start = lines.findIndex((line) => FAILURE_START.test(line));
  if (start < 0) {
    const tail = lines.join('\n').slice(-Math.floor(limit / 2));
    return { before: lines, failure: tail };
  }
  const failure = lines
    .slice(start)
    .filter((line) => !GRADLE_HINT.test(line))
    .join('\n')
    .trim();
  return { before: lines.slice(0, start), failure: failure.slice(0, limit) };
}

export function condenseFailure(text, limit) {
  const whole = withoutToolNoise(text);
  if (whole.length <= limit) {
    return whole;
  }
  const { before, failure } = failureBlock(whole.split('\n'), limit);
  const causes = [
    ...new Set(
      before
        .filter((line) => CAUSE.test(line))
        .map((line) => line.trim().slice(0, MAX_CAUSE_LENGTH)),
    ),
  ];
  const causeText = causes
    .join('\n')
    .slice(0, Math.max(0, limit - failure.length - 2 * SEPARATOR.length));
  const headBudget = limit - failure.length - causeText.length - 2 * SEPARATOR.length;
  const head = headBudget > 0 ? before.join('\n').slice(0, headBudget) : '';
  const newCauses = causes
    .filter((cause) => !head.includes(cause))
    .join('\n')
    .slice(0, causeText.length);
  return [head, newCauses, failure].filter(Boolean).join(SEPARATOR);
}
