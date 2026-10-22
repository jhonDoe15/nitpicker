'use strict';

const { spawnSync } = process.getBuiltinModule('node:child_process');
const { createHash } = process.getBuiltinModule('node:crypto');
const { fstatSync, openSync, readFileSync, writeFileSync, writeSync } =
  process.getBuiltinModule('node:fs');
const { Session } = process.getBuiltinModule('node:inspector');
const path = process.getBuiltinModule('node:path');
const { fileURLToPath, pathToFileURL } = process.getBuiltinModule('node:url');
const { format } = process.getBuiltinModule('node:util');

const directory = process.env.NITPICKER_LOADED_SOURCES ?? '';
const LINES_VARIABLE = 'NITPICKER_TEST_CONSOLE_LINES';
const RUNNER_VARIABLE = 'NITPICKER_TEST_CONSOLE_RUNNER';
const MAX_CONTENT_LENGTH = 4000;
const NO_PLACE = { file: '', test: '' };
const PROJECT_SCRIPT = /^(?:file:\/\/|\/|[A-Za-z]:\\)/u;
const DEPENDENCY = /[\\/]node_modules[\\/]/u;
const OWN_URLS = new Set([__filename, pathToFileURL(__filename).href]);
const BYTE_ORDER_MARK = '﻿';
const APPEND_STANDARD_INPUT =
  "const fs = process.getBuiltinModule('node:fs'); fs.appendFileSync(process.argv[1], fs.readFileSync(0));";

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

function appendInChild(linesPath = '', text = '') {
  return spawnSync(process.execPath, ['-e', APPEND_STANDARD_INPUT, linesPath], {
    input: text,
    env: { ...process.env, NODE_OPTIONS: '' },
    stdio: ['pipe', 'ignore', 'ignore'],
  });
}

const REAL_FILES = { appendInChild, fstatSync, openSync, writeSync };

function identityOf(files = REAL_FILES, descriptor = -1) {
  const { dev, ino } = files.fstatSync(descriptor);
  return `${String(dev)}:${String(ino)}`;
}

function openedLines(linesPath = '', files = REAL_FILES) {
  try {
    const descriptor = files.openSync(linesPath, 'a');
    return { descriptor, identity: identityOf(files, descriptor) };
  } catch (error) {
    return { unavailable: error };
  }
}

function writtenText(files = REAL_FILES, { descriptor = -1, identity = '' } = {}, text = '') {
  try {
    if (identityOf(files, descriptor) !== identity) {
      return { refused: true };
    }
    files.writeSync(descriptor, text);
    return { written: true };
  } catch (error) {
    return { failed: error };
  }
}

function lineWriter(linesPath = '', events = process, files = REAL_FILES) {
  const opened = openedLines(linesPath, files);
  const state = { pending: '' };
  function flush() {
    if (opened.descriptor !== undefined && writtenText(files, opened, state.pending).written) {
      state.pending = '';
    }
  }
  if (opened.descriptor !== undefined) {
    events.on('exit', () => {
      flush();
      if (state.pending !== '') {
        files.appendInChild(linesPath, state.pending);
      }
    });
  }
  return function write(line = '') {
    state.pending += line;
    flush();
  };
}

function recordedLine(locate = () => NO_PLACE, values = []) {
  try {
    const { file, test } = locate();
    if (file === '') {
      return { skipped: true };
    }
    const content = Reflect.apply(format, undefined, values).slice(0, MAX_CONTENT_LENGTH);
    return { line: `${JSON.stringify({ file, test, content })}\n` };
  } catch (error) {
    return { failed: error };
  }
}

function recordConsole(
  linesPath = '',
  locate = () => NO_PLACE,
  { target = globalThis.console, events = process, files = REAL_FILES } = {},
) {
  const write = lineWriter(linesPath, events, files);
  const original = { error: target.error.bind(target), warn: target.warn.bind(target) };
  function recording(print = original.warn) {
    return (...values) => {
      const { line } = recordedLine(locate, values);
      if (line !== undefined) {
        write(line);
      }
      Reflect.apply(print, undefined, values);
    };
  }
  target.error = recording(original.error);
  target.warn = recording(original.warn);
}

function nodeTestApi() {
  return process.getBuiltinModule('node:test');
}

function lastly(context = {}, step = () => {}) {
  const after = 'after' in context ? context.after : undefined;
  if (typeof after === 'function') {
    Reflect.apply(after, context, [step]);
  } else {
    step();
  }
}

function trackedTests(file = '', { after, afterEach, beforeEach } = nodeTestApi()) {
  const running = [''];
  const state = { finished: false };
  beforeEach((context) => {
    running.push(context.fullName);
  });
  afterEach((context) => {
    lastly(context, () => {
      const index = running.lastIndexOf(context.fullName);
      if (index > 0) {
        running.splice(index, 1);
      }
    });
  });
  after((context) => {
    lastly(context, () => {
      setImmediate(() => {
        state.finished = true;
      });
    });
  });
  return function place() {
    return state.finished ? NO_PLACE : { file, test: running.at(-1) ?? '' };
  };
}

function captureNodeTest({
  environment = process.env,
  script = '',
  testRunner = false,
  processId = 0,
  parentId = 0,
  testApi = nodeTestApi,
  target = globalThis.console,
  events = process,
} = {}) {
  const linesPath = environment[LINES_VARIABLE] ?? '';
  const context = environment.NODE_TEST_CONTEXT ?? '';
  if (linesPath === '') {
    return { capturing: false };
  }
  if (context === '' && testRunner && (environment[RUNNER_VARIABLE] ?? '') === '') {
    environment[RUNNER_VARIABLE] = String(processId);
  }
  const isTestFile =
    context.startsWith('child') &&
    script !== '' &&
    environment[RUNNER_VARIABLE] === String(parentId);
  if (isTestFile) {
    recordConsole(linesPath, trackedTests(path.resolve(script), testApi()), { target, events });
  }
  return { capturing: isTestFile };
}

if (directory !== '') {
  loadInChildProcesses();
  connectAndRecord();
}

captureNodeTest({
  environment: process.env,
  script: process.argv[1] ?? '',
  testRunner: process.execArgv.includes('--test'),
  processId: process.pid,
  parentId: process.ppid,
});

module.exports = {
  LINES_VARIABLE,
  MAX_CONTENT_LENGTH,
  RUNNER_VARIABLE,
  captureNodeTest,
  recordConsole,
};
