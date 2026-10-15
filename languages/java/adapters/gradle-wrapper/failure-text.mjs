const JVM_NOTICE =
  /^(?:[\w ]+ : )?Picked up (?:JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|JDK_JAVA_OPTIONS):|^[\d:]+\s*[AP]M PIT >> INFO /u;
const CAUSE = /^\s*Caused by:/u;
const HEAD_SHARE = 0.2;
const MAX_CAUSE_LENGTH = 300;

export function withoutJvmNotices(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !JVM_NOTICE.test(line))
    .join('\n')
    .trim();
}

export function condenseFailure(text, limit) {
  const lines = withoutJvmNotices(text).split('\n');
  const whole = lines.join('\n');
  if (whole.length <= limit) {
    return whole;
  }
  const headBudget = Math.floor(limit * HEAD_SHARE);
  const head = whole.slice(0, headBudget);
  const causes = lines
    .filter((line) => CAUSE.test(line) && !head.includes(line))
    .map((line) => line.trim().slice(0, MAX_CAUSE_LENGTH));
  const causeText = [...new Set(causes)].join('\n');
  const tailBudget = Math.max(0, limit - head.length - causeText.length - 12);
  const tail = tailBudget === 0 ? '' : whole.slice(-tailBudget);
  return [head, causeText, tail].filter(Boolean).join('\n...\n');
}
