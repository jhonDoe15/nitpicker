import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export const DEFAULT_PYTHON_FILES = ['test_*.py', '*_test.py'];
const INI_SOURCES = [
  { file: 'pytest.ini', section: 'pytest', always: true },
  { file: 'tox.ini', section: 'pytest', always: false },
  { file: 'setup.cfg', section: 'tool:pytest', always: false },
];
const SECTION = /^\[([^\]]+)\]\s*$/;
const OPTION = /^python_files\s*[=:]\s*(.*)$/;

function patternsOf(text) {
  return text.split(/\s+/).filter((entry) => entry !== '');
}

function optionLines(text, section) {
  const options = [];
  let inside = false;
  let found = false;
  for (const line of text.split(/\r?\n/)) {
    const header = SECTION.exec(line.trim());
    if (header !== null) {
      inside = header[1] === section;
      found ||= inside;
    } else if (inside) {
      options.push(line);
    }
  }
  return found ? options : undefined;
}

function pythonFilesValue(lines) {
  let value = '';
  let collecting = false;
  for (const line of lines) {
    const option = OPTION.exec(line);
    if (option !== null) {
      value = option[1];
      collecting = true;
    } else if (collecting && /^\s/.test(line)) {
      value += ` ${line.trim()}`;
    } else {
      collecting = false;
    }
  }
  return value;
}

function iniPatterns(text, section) {
  const lines = optionLines(text, section);
  return lines === undefined ? undefined : patternsOf(pythonFilesValue(lines));
}

function tomlPatterns(text) {
  const { tool = {} } = createRequire(import.meta.url)('smol-toml').parse(text);
  const options = tool.pytest?.ini_options;
  if (options === undefined) {
    return undefined;
  }
  const files = options.python_files;
  return typeof files === 'string' ? patternsOf(files) : (files ?? []);
}

function readSource(projectRoot, { file, section, always }) {
  const target = path.join(projectRoot, file);
  if (!existsSync(target)) {
    return undefined;
  }
  const patterns = iniPatterns(readFileSync(target, 'utf8'), section);
  return patterns === undefined && always ? [] : patterns;
}

function pyprojectPatterns(projectRoot) {
  const target = path.join(projectRoot, 'pyproject.toml');
  try {
    return existsSync(target) ? tomlPatterns(readFileSync(target, 'utf8')) : undefined;
  } catch {
    return undefined;
  }
}

export function readPythonFiles(projectRoot) {
  const [first, ...rest] = INI_SOURCES;
  const configured =
    readSource(projectRoot, first) ??
    pyprojectPatterns(projectRoot) ??
    rest.map((source) => readSource(projectRoot, source)).find((found) => found !== undefined);
  return configured === undefined || configured.length === 0 ? DEFAULT_PYTHON_FILES : configured;
}
