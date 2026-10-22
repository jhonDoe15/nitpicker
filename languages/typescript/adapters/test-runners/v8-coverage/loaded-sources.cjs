'use strict';

const { createHash } = process.getBuiltinModule('node:crypto');
const { appendFileSync, readFileSync, writeFileSync } = process.getBuiltinModule('node:fs');
const { Session } = process.getBuiltinModule('node:inspector');
const path = process.getBuiltinModule('node:path');
const { fileURLToPath, pathToFileURL } = process.getBuiltinModule('node:url');
const { format } = process.getBuiltinModule('node:util');

const directory = process.env.NITPICKER_LOADED_SOURCES ?? '';
const consoleLines = process.env.NITPICKER_TEST_CONSOLE_LINES ?? '';
const MAX_CONSOLE_LENGTH = 4000;
const PROJECT_SCRIPT = /^(?:file:\/\/|\/|[A-Za-z]:\\)/u;
const DEPENDENCY = /[\\/]node_modules[\\/]/u;
const OWN_URLS = new Set([__filename, pathToFileURL(__filename).href]);
const BYTE_ORDER_MARK = '﻿';

function fileText(url = '') {
  try {
    const text = readFileSync(url.startsWith('file://') ? fileURLToPath(url) : url, 'utf8');
    return text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
  } catch (error) {
    return { unreadable: String(error) };
  }
}

function saveSource(url = '', source = '') {
  if (source === fileText(url)) {
    return;
  }
  const text = JSON.stringify({ url, source });
  const name = `${createHash('sha256').update(text).digest('hex')}.json`;
  try {
    writeFileSync(path.join(directory, name), text, { flag: 'wx' });
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code !== 'EEXIST') {
      throw new Error(`Could not record the source of ${url}`, { cause: error });
    }
  }
}

function isProjectScript(url = '') {
  return PROJECT_SCRIPT.test(url) && !DEPENDENCY.test(url) && !OWN_URLS.has(url);
}

function recordLoadedSources(session = new Session()) {
  session.on('Debugger.scriptParsed', ({ params }) => {
    if (isProjectScript(params.url)) {
      session.post('Debugger.getScriptSource', { scriptId: params.scriptId }, (error, result) => {
        if (error === null) {
          saveSource(params.url, result.scriptSource);
        }
      });
    }
  });
  session.post('Debugger.enable');
}

function connectAndRecord() {
  const session = new Session();
  try {
    session.connect();
  } catch (error) {
    return { unavailable: String(error) };
  }
  recordLoadedSources(session);
  return { recording: true };
}

function loadInChildProcesses() {
  const nodeOptions = process.env.NODE_OPTIONS ?? '';
  const quoted = `"${__filename.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
  const option = `--require ${quoted}`;
  if (!nodeOptions.includes(option)) {
    process.env.NODE_OPTIONS = `${nodeOptions} ${option}`.trim();
  }
}

function formatted(values = []) {
  return Reflect.apply(format, undefined, values);
}

function appendLine(linesPath = '', place = { file: '', test: '' }, content = '') {
  const line = { ...place, content: content.slice(0, MAX_CONSOLE_LENGTH) };
  appendFileSync(linesPath, `${JSON.stringify(line)}\n`);
}

function wrapConsole(linesPath = '', locate = () => ({ file: '', test: '' })) {
  const target = globalThis.console;
  const original = {
    error: target.error.bind(target),
    warn: target.warn.bind(target),
    trace: target.trace.bind(target),
    assert: target.assert.bind(target),
  };
  target.error = (...values) => {
    appendLine(linesPath, locate(), formatted(values));
    Reflect.apply(original.error, undefined, values);
  };
  target.warn = (...values) => {
    appendLine(linesPath, locate(), formatted(values));
    Reflect.apply(original.warn, undefined, values);
  };
  target.trace = (...values) => {
    const text = values.length === 0 ? 'Trace' : `Trace: ${formatted(values)}`;
    appendLine(linesPath, locate(), text);
    Reflect.apply(original.trace, undefined, values);
  };
  target.assert = (...values) => {
    if (!values[0]) {
      const text =
        values.length === 1
          ? 'Assertion failed'
          : `Assertion failed: ${formatted(values.slice(1))}`;
      appendLine(linesPath, locate(), text);
    }
    Reflect.apply(original.assert, undefined, values);
  };
}

function nodeTestPlace() {
  const { beforeEach, afterEach } = process.getBuiltinModule('node:test');
  const active = [''];
  const file = path.resolve(process.argv[1] ?? '');
  beforeEach((context) => {
    active.push(context.fullName);
  });
  afterEach((context) => {
    const index = active.lastIndexOf(context.fullName);
    if (index !== -1) {
      active.splice(index, 1);
    }
  });
  return function place() {
    return { file, test: active.at(-1) ?? '' };
  };
}

function namedPlace() {
  return function place() {
    return {
      file: process.env.NITPICKER_TEST_CONSOLE_FILE ?? '',
      test: process.env.NITPICKER_TEST_CONSOLE_TEST ?? '',
    };
  };
}

function recordConsole(linesPath = '') {
  const context = process.env.NODE_TEST_CONTEXT ?? '';
  const isTestFile = context.startsWith('child') && process.argv[1] !== undefined;
  if (context === '' || isTestFile) {
    wrapConsole(linesPath, isTestFile ? nodeTestPlace() : namedPlace());
  }
}

if (directory !== '') {
  loadInChildProcesses();
  connectAndRecord();
}

if (consoleLines !== '') {
  recordConsole(consoleLines);
}
