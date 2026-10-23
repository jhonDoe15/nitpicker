import { EFFECT_HINTS } from './effects/index.mjs';
import { FIELD_SEPARATOR, PATH_SEPARATOR } from './effects/subject.mjs';
import { WRITE_HINTS } from './writes/index.mjs';

const STRUCTURED_RULES = new Set([...EFFECT_HINTS, ...WRITE_HINTS].flatMap(({ rules }) => rules));
const CALL_MARKS = /\((?:\.\.\.)?\)|\[\.\.\.\]/gu;
const CALL_END = '()';

export function identitySubject(rule, subject) {
  if (!STRUCTURED_RULES.has(rule)) {
    return subject;
  }
  const [first = ''] = subject.split(FIELD_SEPARATOR)[0].split(PATH_SEPARATOR);
  return first.endsWith(CALL_END) ? `${first.replaceAll(CALL_MARKS, '')}${CALL_END}` : first;
}
