'use strict';

const { createHash } = process.getBuiltinModule('node:crypto');
const { readFileSync, writeFileSync } = process.getBuiltinModule('node:fs');
const { Session } = process.getBuiltinModule('node:inspector');
const path = process.getBuiltinModule('node:path');
const { fileURLToPath, pathToFileURL } = process.getBuiltinModule('node:url');

const directory = process.env.NITPICKER_LOADED_SOURCES ?? '';
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

if (directory !== '') {
  loadInChildProcesses();
  connectAndRecord();
}
