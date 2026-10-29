import { isExceptionEntry, routeFields } from './exception-sentence.mjs';

const EXCEPTION_LISTS = ['exceptions', 'python.exceptions'];

const ADVICE_KEYS = new Set(['allowedForm', 'exception', 'exceptionList']);

function sortedKeys(_key, value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
        Object.keys(value)
          .toSorted()
          .map((key) => [key, value[key]]),
      )
    : value;
}

function sameExceptionEntry(left, right) {
  return JSON.stringify(left, sortedKeys) === JSON.stringify(right, sortedKeys);
}

/** What is wrong with the advice fields of a finding against its message; empty when they agree. */
export function adviceProblems({ message, allowedForm, exception, exceptionList }) {
  const route = routeFields(message);
  return [
    ...(allowedForm === undefined || message.includes(allowedForm)
      ? []
      : [`allowedForm is not part of the message: ${allowedForm}`]),
    ...(exception === undefined && exceptionList !== undefined
      ? ['exceptionList needs exception, the entry to add']
      : []),
    ...(exception !== undefined && !isExceptionEntry(exception)
      ? ['exception must have a rule, a non-empty paths array and a reason']
      : []),
    ...(exception !== undefined && !EXCEPTION_LISTS.includes(exceptionList)
      ? [
          `exception needs exceptionList: ${EXCEPTION_LISTS.map((list) => `"${list}"`).join(' or ')}`,
        ]
      : []),
    ...(exception !== undefined && route.exception === undefined
      ? ['exception is set, but the message prints no exception sentence']
      : []),
    ...(exception !== undefined &&
    route.exception !== undefined &&
    (!sameExceptionEntry(exception, route.exception) || exceptionList !== route.exceptionList)
      ? [
          `exception ${JSON.stringify(exception)} in "${String(exceptionList)}" differs from the entry the message prints`,
        ]
      : []),
  ];
}

/**
 * `finding` with the text `message`: `allowedForm` replaces its allowed form (none when undefined),
 * and the exception fields are read again from the new message, so they always agree with it.
 */
export function withMessage(finding, { message, allowedForm }) {
  const rest = Object.fromEntries(Object.entries(finding).filter(([key]) => !ADVICE_KEYS.has(key)));
  return {
    ...rest,
    message,
    ...(allowedForm === undefined ? {} : { allowedForm }),
    ...routeFields(message),
  };
}
