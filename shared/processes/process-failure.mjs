const NODE_NOTICE =
  /^\(node:\d+\) (?:\[DEP\d+\] )?(?!UnhandledPromiseRejection)[A-Za-z]*Warning: /u;
const CARRIES_ERROR = /\b[A-Za-z]*Error\b/u;
const TRACE_HINT = /^\(Use `node --trace-/u;
const MEMORY_REMEDY =
  'usually the out-of-memory killer; run fewer jobs at once with NITPICKER_MAX_PARALLEL ' +
  'or give the job more memory';

function isNotice(line) {
  return TRACE_HINT.test(line) || (NODE_NOTICE.test(line) && !CARRIES_ERROR.test(line));
}

function withoutWarnings(text) {
  return String(text ?? '')
    .split(/\r?\n/u)
    .filter((line) => !isNotice(line.trim()))
    .join('\n')
    .trim();
}

export function failureDetail({ stderr, stdout }) {
  return withoutWarnings(stderr) || String(stdout ?? '').trim();
}

export function signalEnd(signal) {
  return signal === 'SIGKILL'
    ? `was killed by SIGKILL (${MEMORY_REMEDY})`
    : `was terminated by ${signal}`;
}

export function describeProcessEnd(name, result, { where, detail = failureDetail(result) } = {}) {
  const place = where === undefined ? '' : ` in ${where}`;
  if (typeof result.signal === 'string') {
    return `${name} ${signalEnd(result.signal)}${place}${detail === '' ? '' : `: ${detail}`}`;
  }
  return `${name} exited with ${String(result.status)}${place}: ${detail || 'no diagnostic output'}`;
}
