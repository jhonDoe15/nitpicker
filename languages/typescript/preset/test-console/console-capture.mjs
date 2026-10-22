import { appendFileSync } from 'node:fs';
import { format } from 'node:util';
import { consoleEntry } from './console-report.mjs';

export const LINES_VARIABLE = 'NITPICKER_TEST_CONSOLE_LINES';

function traceContent(values) {
  return values.length === 0 ? 'Trace' : `Trace: ${format(...values)}`;
}

function assertContent([value, ...rest]) {
  if (value) {
    return undefined;
  }
  return rest.length === 0 ? 'Assertion failed' : `Assertion failed: ${format(...rest)}`;
}

const CONTENT_OF = {
  error: (values) => format(...values),
  warn: (values) => format(...values),
  trace: traceContent,
  assert: assertContent,
};

export function captureConsole({ target, locate, linesPath, root }) {
  if (linesPath === undefined || linesPath === '') {
    return;
  }
  for (const [method, contentOf] of Object.entries(CONTENT_OF)) {
    const original = target[method];
    target[method] = (...values) => {
      const content = contentOf(values);
      const entry =
        content === undefined ? undefined : consoleEntry({ content, root, ...locate() });
      if (entry !== undefined) {
        appendFileSync(linesPath, `${JSON.stringify(entry)}\n`);
      }
      return Reflect.apply(original, target, values);
    };
  }
}

export function activeNames() {
  const names = [];
  return {
    enter(name) {
      names.push(name);
    },
    leave(name) {
      const index = names.lastIndexOf(name);
      if (index !== -1) {
        names.splice(index, 1);
      }
    },
    current() {
      return names.at(-1) ?? '';
    },
  };
}
