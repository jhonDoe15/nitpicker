const CONSTANT = String.raw`[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)*`;
const EMPTY_CALL = String.raw`(?:\w+\.)?(?:empty\w*|listOf|setOf|mapOf|of)\(\)`;
const QUOTED = String.raw`(["'])\s*\1`;
const NUMBER = String.raw`-?\d[\w.]*`;
const PYTHON_VALUE = String.raw`None|True|False|${NUMBER}|\[\]|\{\}|\(\)|${QUOTED}|${CONSTANT}`;
const JVM_VALUE = String.raw`null|true|false|${NUMBER}|${QUOTED}|${CONSTANT}|${EMPTY_CALL}`;
const NOOP = {
  python: new RegExp(
    String.raw`^(?:pass|\.\.\.|continue|break|return(?:\s+(?:${PYTHON_VALUE}))?)$`,
    'u',
  ),
  jvm: new RegExp(
    String.raw`^(?:continue|break|Unit|(?:return(?:@\w+)?)(?:\s+(?:${JVM_VALUE}))?|${JVM_VALUE})$`,
    'u',
  ),
};
const RETHROWS = /\b(?:throw|raise)\b/u;

/** Whether every statement only discards the error: `pass`, `continue`, a literal `return` ... */
export function onlyDiscards(statements, language) {
  const noop = NOOP[language === 'python' ? 'python' : 'jvm'];
  return statements.length === 0 || statements.every((statement) => noop.test(statement));
}

/** The statements of a handler body, one per `;` or line break, without blanks. */
export const statementsOf = (body) =>
  body
    .split(/[;\n]/u)
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');

/**
 * What a `catch` or `except` handler amounts to, the same in every language. `ignored-error`: its
 * body does nothing with the error (it is empty, or only passes, continues, breaks or returns a
 * literal), whatever the exception type. `broad-catch`: it catches a generic type and does not
 * rethrow. A handler that rethrows, or that catches a narrow type and acts, is neither. Returns
 * `{ kind, key, detail }` or undefined; `shown` is the handler's head, such as `catch (IOException e)`.
 */
export function handlerFinding({ language, statements, body, broadTypes, shown }) {
  if (onlyDiscards(statements, language)) {
    return {
      kind: 'ignored-error',
      key: `swallow|${shown}`,
      detail: `${shown} swallows the error`,
    };
  }
  if (broadTypes.length === 0 || RETHROWS.test(body)) return undefined;
  return {
    kind: 'broad-catch',
    key: `broad|${broadTypes.join('|')}`,
    detail: `${shown} hides which failure happened`,
  };
}
