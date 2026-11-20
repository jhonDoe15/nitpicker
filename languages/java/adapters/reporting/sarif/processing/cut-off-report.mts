const DOCUMENT_START = /\{\s*"\$schema"/gu;
const NOTIFICATIONS = '"toolExecutionNotifications": [';
const MESSAGE_TEXT = /"message":\s*\{\s*"text":\s*"/gu;
const FIRST_LINE = /^(?:[^"\\\n]|\\(?!n)[^u\n]|\\u[\da-f]{4})*/iu;
const END_OF_INPUT = 'end of JSON input';
const FAILED_AT = /position (?<position>\d+)/u;
const CLOSE_MESSAGE = '"}}';
const CLOSE_REPORT = ']}]}]}';

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

function isComplete(written: string): boolean {
  return parseFailure(written) === undefined;
}

function repaired(written: string): string | undefined {
  if (isComplete(written)) {
    return written;
  }
  const notifications = written.lastIndexOf(NOTIFICATIONS);
  if (notifications < 0) {
    return undefined;
  }
  const listed = notifications + NOTIFICATIONS.length;
  const message = lastMatchOf(written.slice(listed), MESSAGE_TEXT);
  if (message === undefined) {
    return `${written.slice(0, listed)}${CLOSE_REPORT}`;
  }
  const started = listed + message.index + message[0].length;
  const line = FIRST_LINE.exec(written.slice(started))?.[0] ?? '';
  return `${written.slice(0, started)}${line}${CLOSE_MESSAGE}${CLOSE_REPORT}`;
}

export function cutOffSarifReport(text: string): string | undefined {
  const start = lastMatchOf(text, DOCUMENT_START)?.index;
  const document = start === undefined ? '' : text.slice(start);
  const failed = parseFailure(document);
  return failed === undefined || Number.isNaN(failed)
    ? undefined
    : repaired(document.slice(0, failed));
}
