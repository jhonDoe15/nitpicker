import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import path from 'node:path';

const directory = process.env.NITPICKER_LOADED_SOURCES;
const PROJECT_SCRIPT = /^(?:file:\/\/|\/|[A-Za-z]:\\)/u;
const DEPENDENCY = /[\\/]node_modules[\\/]/u;

function saveSource(url, source) {
  const text = JSON.stringify({ url, source });
  const name = `${createHash('sha256').update(text).digest('hex')}.json`;
  writeFileSync(path.join(directory, name), text);
}

function recordLoadedSources() {
  const session = new Session();
  session.connect();
  const scripts = new Map();
  session.on('Debugger.scriptParsed', ({ params }) => {
    if (
      PROJECT_SCRIPT.test(params.url) &&
      !DEPENDENCY.test(params.url) &&
      params.url !== import.meta.url
    ) {
      scripts.set(params.scriptId, params.url);
    }
  });
  session.post('Debugger.enable');
  process.on('exit', () => {
    for (const [scriptId, url] of scripts) {
      session.post('Debugger.getScriptSource', { scriptId }, (error, result) => {
        if (error === null) {
          saveSource(url, result.scriptSource);
        }
      });
    }
  });
}

function loadInChildProcesses() {
  const nodeOptions = process.env.NODE_OPTIONS ?? '';
  if (!nodeOptions.includes(import.meta.url)) {
    process.env.NODE_OPTIONS = `${nodeOptions} --import=${import.meta.url}`.trim();
  }
}

if (directory !== undefined) {
  loadInChildProcesses();
  recordLoadedSources();
}
