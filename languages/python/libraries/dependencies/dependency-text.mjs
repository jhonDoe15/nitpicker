import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16_LE_BOM = [0xff, 0xfe];
const UTF16_BE_BOM = [0xfe, 0xff];
const INI_SECTION = /^\[([^\]]+)\]\s*$/u;

function startsWith(buffer, bytes) {
  return bytes.every((byte, index) => buffer[index] === byte);
}

export function decodeText(buffer) {
  if (startsWith(buffer, UTF8_BOM)) {
    return buffer.subarray(UTF8_BOM.length).toString('utf8');
  }
  if (startsWith(buffer, UTF16_LE_BOM) || (buffer[1] === 0 && buffer[0] > 0)) {
    return new TextDecoder('utf-16le').decode(buffer).replace(/^﻿/u, '');
  }
  if (startsWith(buffer, UTF16_BE_BOM) || (buffer[0] === 0 && buffer[1] > 0)) {
    return new TextDecoder('utf-16be').decode(buffer).replace(/^﻿/u, '');
  }
  return buffer.toString('utf8');
}

export function readText(file) {
  return decodeText(readFileSync(file));
}

export function parseToml(text) {
  try {
    return createRequire(import.meta.url)('smol-toml').parse(text);
  } catch {
    return {};
  }
}

function setOption(state, trimmed) {
  const split = trimmed.search(/[=:]/u);
  if (split <= 0) {
    return;
  }
  state.key = trimmed.slice(0, split).trim();
  state.options.set(state.key, trimmed.slice(split + 1).trim());
}

function readIniLine(line, sections, state) {
  const trimmed = line.trim();
  const indented = /^\s/u.test(line);
  const header = indented ? undefined : (INI_SECTION.exec(trimmed) ?? undefined);
  if (trimmed === '' || /^[#;]/u.test(trimmed)) {
    state.key = undefined;
  } else if (header !== undefined) {
    state.options = new Map();
    state.key = undefined;
    sections.set(header[1].trim(), state.options);
  } else if (indented && state.key !== undefined) {
    state.options.set(state.key, `${state.options.get(state.key)}\n${trimmed}`);
  } else if (state.options !== undefined) {
    setOption(state, trimmed);
  }
}

export function parseIni(text) {
  const sections = new Map();
  const state = { options: undefined, key: undefined };
  for (const line of text.split(/\r?\n/u)) {
    readIniLine(line, sections, state);
  }
  return sections;
}
