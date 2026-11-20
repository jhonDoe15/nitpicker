const DOCUMENT_START = /\{\s*"\$schema"/gu;
const NOTIFICATIONS = '"toolExecutionNotifications": [';
const MESSAGE_TEXT = /"message":\s*\{\s*"text":\s*"/gu;
const FIRST_LINE = /^(?:[^"\\\n]|\\(?!n)[^u\n]|\\u[\da-f]{4})*/iu;
const REST_OF_TEXT = /^(?:[^"\\]|\\[\s\S])*"/u;
const WHOLE_NOTIFICATION = /^\s*\}\s*\}(?=\s*(?<next>[,\]]))/u;
const END_OF_INPUT = 'end of JSON input';
const FAILED_AT = /position (?<position>\d+)/u;
const CLOSE_MESSAGE = '"}}';
const CLOSE_NOTIFICATIONS = ']';
const CLOSE_INVOCATION = '}]}]}';
const LAST_NOTIFICATION = ']';

function lastMatchOf(text: string, pattern: RegExp): RegExpExecArray | undefined {
  return [...text.matchAll(pattern)].at(-1);
}

function parseFailure(text: string): number | undefined {
  try {
    JSON.parse(text);
    return undefined;
  } catch (error) {
    const position = FAILED_AT.exec(String(error))?.groups?.['position'];
    const atEnd = String(error).includes(END_OF_INPUT) ? text.length : Number.NaN;
    return position === undefined ? atEnd : Number(position);
  }
}

function closedAfterFirstLine(written: string, started: number): string {
  const line = FIRST_LINE.exec(written.slice(started))?.[0] ?? '';
  return `${written.slice(0, started)}${line}${CLOSE_MESSAGE}${CLOSE_NOTIFICATIONS}${CLOSE_INVOCATION}`;
}

function wholeUntil(
  written: string,
  started: number,
): { end: number; isLast: boolean } | undefined {
  const text = REST_OF_TEXT.exec(written.slice(started))?.[0];
  if (text === undefined) {
    return undefined;
  }
  const closed = WHOLE_NOTIFICATION.exec(written.slice(started + text.length));
  return closed === null
    ? undefined
    : {
        end: started + text.length + closed[0].length,
        isLast: closed.groups?.['next'] === LAST_NOTIFICATION,
      };
}

function repaired(written: string, listed: number): string {
  let reached = listed;
  for (const message of written.slice(listed).matchAll(MESSAGE_TEXT)) {
    const started = listed + message.index + message[0].length;
    const whole = started < reached ? undefined : wholeUntil(written, started);
    if (started >= reached && whole === undefined) {
      return closedAfterFirstLine(written, started);
    }
    reached = whole?.end ?? reached;
    if (whole?.isLast === true) {
      break;
    }
  }
  return `${written.slice(0, reached)}${CLOSE_NOTIFICATIONS}${CLOSE_INVOCATION}`;
}

export function cutOffSarifReport(text: string): string | undefined {
  const start = lastMatchOf(text, DOCUMENT_START)?.index;
  const document = start === undefined ? '' : text.slice(start);
  const failed = parseFailure(document);
  if (failed === undefined || Number.isNaN(failed)) {
    return undefined;
  }
  if (parseFailure(document.slice(0, failed)) === undefined) {
    return document.slice(0, failed);
  }
  const notifications = document.indexOf(NOTIFICATIONS);
  const listed = notifications + NOTIFICATIONS.length;
  return notifications < 0 || failed < listed ? undefined : repaired(document, listed);
}
