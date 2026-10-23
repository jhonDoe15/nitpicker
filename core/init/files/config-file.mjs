import { existsSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { CONFIG_FILE_NAME, isPlainObject } from '../../../shared/config.mjs';
import { insideProject } from '../support/inside-project.mjs';
import { placeFile } from './place-file.mjs';

const DEFAULT_PRESET = 'typescript';
const PRESET_ENTRY = /("preset"\s*:\s*)"(?:[^"\\]|\\.)*"/u;
const NEXT_LINE_INDENT = /^[ \t]*\n([ \t]*)/u;
const NOT_AN_OBJECT = 'It is not a JSON object, so init cannot add the preset to it.';

export function renderConfig(config) {
  const entries = Object.entries(config).map(
    ([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`,
  );
  return `{ ${entries.join(', ')} }\n`;
}

function parsedConfig(text) {
  try {
    const config = JSON.parse(text);
    return isPlainObject(config) ? { kind: 'parsed', config } : { kind: 'invalid' };
  } catch (error) {
    return { kind: 'invalid', error };
  }
}

export function existingConfig(root) {
  const file = insideProject(root, CONFIG_FILE_NAME);
  return existsSync(file) ? parsedConfig(readFileSync(file, 'utf8')) : { kind: 'missing' };
}

function insertedPreset(text, entry) {
  const open = text.indexOf('{');
  const head = text.slice(0, open + 1);
  const rest = text.slice(open + 1);
  if (rest.trim().startsWith('}')) {
    return `${head} ${entry} ${rest.trimStart()}`;
  }
  const indent = NEXT_LINE_INDENT.exec(rest)?.[1];
  if (indent !== undefined) {
    return `${head}\n${indent}${entry},${rest}`;
  }
  return `${head}${/^\s/u.test(rest) ? ' ' : ''}${entry}, ${rest.trimStart()}`;
}

function revisedText(text, config, preset) {
  const value = JSON.stringify(preset);
  const edited =
    config.preset === undefined
      ? insertedPreset(text, `"preset": ${value}`)
      : text.replace(PRESET_ENTRY, `$1${value}`);
  const wanted = {
    preset,
    ...Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'preset')),
  };
  const parsed = parsedConfig(edited);
  return parsed.kind === 'parsed' && isDeepStrictEqual(parsed.config, wanted)
    ? edited
    : `${JSON.stringify(wanted, undefined, 2)}\n`;
}

function revision(text, preset) {
  const parsed = parsedConfig(text);
  if (parsed.kind === 'invalid') {
    return { after: renderConfig({ preset }), reason: NOT_AN_OBJECT };
  }
  const declared = parsed.config.preset;
  if (declared === preset || (declared === undefined && preset === DEFAULT_PRESET)) {
    return undefined;
  }
  return {
    after: revisedText(text, parsed.config, preset),
    reason:
      declared === undefined
        ? `It sets no preset: add "preset": "${preset}".`
        : `It sets "preset": ${JSON.stringify(declared)}, and this project needs "preset": "${preset}".`,
  };
}

export function placeConfig(root, preset) {
  return placeFile({
    root,
    relative: CONFIG_FILE_NAME,
    content: renderConfig({ preset }),
    revise: (current) => revision(current, preset),
  });
}
