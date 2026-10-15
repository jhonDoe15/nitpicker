import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createToolContext } from '../execution/python-tools.mjs';
import { installFakeToolchain } from './fake-toolchain.mjs';

function writeFiles(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), contents);
  }
  return root;
}

function assignEnvironment(name, value) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
  } else {
    process.env[name] = value;
  }
}

export function createScratch() {
  const roots = [];
  const savedEnvironment = new Map();

  function directory() {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-scratch-')));
    roots.push(root);
    return root;
  }

  function setEnvironment(name, value) {
    if (!savedEnvironment.has(name)) {
      savedEnvironment.set(name, process.env[name]);
    }
    assignEnvironment(name, value);
  }

  function project({ files = {}, tools } = {}) {
    const root = writeFiles(directory(), files);
    installFakeToolchain(path.join(root, '.venv/bin'), tools);
    const reportRoot = directory();
    return {
      root,
      reportRoot,
      context: createToolContext({ projectRoot: root, liveRoot: root, reportRoot }),
    };
  }

  function cleanup() {
    for (const [name, value] of savedEnvironment) {
      assignEnvironment(name, value);
    }
    savedEnvironment.clear();
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  return { directory, write: writeFiles, setEnvironment, project, cleanup };
}
